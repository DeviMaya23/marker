package usecase

import (
	"context"
	"fmt"
	"net/url"
	"time"

	"github.com/google/uuid"

	"marker/internal/domain"
)

// IdentityProvider is the external OIDC provider, as the login flow sees it. It is
// satisfied by adaptor.OIDCClient.
type IdentityProvider interface {
	// AuthorizeURL returns the IdP URL to send the browser to for one login attempt.
	AuthorizeURL(ctx context.Context, state, nonce, verifier string) (string, error)
	// Exchange trades an authorization code for the verified ID token's subject. It
	// returns domain.ErrInvalidLogin when the IdP or the token rejects the attempt, and
	// any other error for a fault.
	Exchange(ctx context.Context, code, verifier, nonce string) (subject string, err error)
}

// SessionManager starts and ends app sessions. It is satisfied by *AuthService.
type SessionManager interface {
	StartSession(ctx context.Context, idpID string) (Grant, error)
	EndSession(ctx context.Context, sessionID uuid.UUID) error
}

// LoginConfig is the login flow's settings. The redirect URI sent to the IdP is the
// adaptor's concern, not this one's.
type LoginConfig struct {
	StateSecret         []byte // signs the login state and derives the PKCE verifier
	LogoutURL           string // the IdP logout endpoint
	LogoutRedirectParam string // query parameter carrying the return address; empty means "redirect"
	LogoutReturnURL     string // where the IdP sends the browser after logout
}

// LoginService runs the OIDC login and logout (FR-1, FR-2). The user is keyed on the IdP
// subject only: no email, name or token is read or stored.
type LoginService struct {
	idp      IdentityProvider
	sessions SessionManager
	cfg      LoginConfig
	now      func() time.Time
}

func NewLoginService(idp IdentityProvider, sessions SessionManager, cfg LoginConfig) *LoginService {
	return &LoginService{idp: idp, sessions: sessions, cfg: cfg, now: time.Now}
}

// LoginAttempt is one started login: where to send the browser, and the binding value to
// hand the browser in the login_binding cookie so only it can finish this attempt.
type LoginAttempt struct {
	AuthorizeURL string
	Binding      string
	MaxAge       int // seconds the cookie (and the state) live
}

// Begin starts a login attempt. returnTo must already be a safe same-origin path; it
// comes back from Complete. The state carries the hash of a fresh binding value, which is
// returned separately and never appears in the state or the URL.
func (s *LoginService) Begin(ctx context.Context, returnTo string) (LoginAttempt, error) {
	nonce, err := newNonce()
	if err != nil {
		return LoginAttempt{}, err
	}
	binding, err := randomToken()
	if err != nil {
		return LoginAttempt{}, err
	}
	st := loginState{
		Nonce:    nonce,
		ReturnTo: returnTo,
		Expires:  s.now().Add(loginStateTTL).Unix(),
		Binding:  bindingHash(s.cfg.StateSecret, binding),
	}
	state, err := signState(s.cfg.StateSecret, st)
	if err != nil {
		return LoginAttempt{}, err
	}
	if len(state) > maxStateLen {
		// A return_to full of characters JSON escapes. Never mint a state Complete would refuse.
		st.ReturnTo = "/"
		state, err = signState(s.cfg.StateSecret, st)
		if err != nil {
			return LoginAttempt{}, err
		}
	}
	u, err := s.idp.AuthorizeURL(ctx, state, nonce, pkceVerifier(s.cfg.StateSecret, nonce))
	if err != nil {
		return LoginAttempt{}, err
	}
	return LoginAttempt{AuthorizeURL: u, Binding: binding, MaxAge: int(loginStateTTL.Seconds())}, nil
}

// Complete finishes a login attempt, in this order: verify the state, check that binding
// (the login_binding cookie value) belongs to it, check the code, exchange it, start a
// session for the subject. The IdP is never called before the binding is verified. Bad attempts are domain.ErrInvalidLogin; anything else is a fault. Once the state
// verified, the returned return-to is set even on failure, so a retry can go back there.
func (s *LoginService) Complete(ctx context.Context, code, state, binding string) (Grant, string, error) {
	st, err := verifyState(s.cfg.StateSecret, state, s.now())
	if err != nil {
		return Grant{}, "", err
	}
	if !bindingMatches(s.cfg.StateSecret, st, binding) {
		return Grant{}, st.ReturnTo, domain.ErrInvalidLogin
	}
	if code == "" || len(code) > maxCodeLen {
		return Grant{}, st.ReturnTo, domain.ErrInvalidLogin
	}

	subject, err := s.idp.Exchange(ctx, code, pkceVerifier(s.cfg.StateSecret, st.Nonce), st.Nonce)
	if err != nil {
		return Grant{}, st.ReturnTo, err
	}
	if subject == "" {
		return Grant{}, st.ReturnTo, domain.ErrInvalidLogin
	}

	grant, err := s.sessions.StartSession(ctx, subject)
	if err != nil {
		return Grant{}, st.ReturnTo, err
	}
	return grant, st.ReturnTo, nil
}

// Logout ends the app session and returns the IdP logout URL, with the return address
// set so the browser comes back to the app. If ending the session fails no URL is
// returned, because the session may still be alive.
func (s *LoginService) Logout(ctx context.Context, sessionID uuid.UUID) (string, error) {
	if err := s.sessions.EndSession(ctx, sessionID); err != nil {
		return "", err
	}

	u, err := url.Parse(s.cfg.LogoutURL)
	if err != nil {
		return "", fmt.Errorf("parse logout url: %w", err)
	}
	param := s.cfg.LogoutRedirectParam
	if param == "" {
		param = "redirect"
	}
	q := u.Query()
	q.Set(param, s.cfg.LogoutReturnURL)
	u.RawQuery = q.Encode()
	return u.String(), nil
}
