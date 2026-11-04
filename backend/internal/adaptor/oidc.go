package adaptor

import (
	"context"
	"crypto/subtle"
	"errors"
	"fmt"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"

	"marker/internal/domain"
)

const oidcHTTPTimeout = 10 * time.Second

// OIDCConfig configures the client of the identity provider. The issuer is operator
// configuration, not a user-supplied URL, so the client does not use pkg/safehttp.
type OIDCConfig struct {
	IssuerURL    string
	ClientID     string
	ClientSecret string // never logged, never in an error
	RedirectURL  string // the full callback URL, sent as redirect_uri
	HTTPClient   *http.Client
}

// OIDCClient talks to the identity provider through the OIDC authorization-code flow
// with PKCE. Discovery is lazy: creating the client makes no request, the provider is
// found on first use, and a failure is not cached.
type OIDCClient struct {
	cfg  OIDCConfig
	http *http.Client
	ctx  context.Context // long-lived: go-oidc reuses it for later key fetches
	keys *fetchTracker

	mu       sync.Mutex
	oauth    *oauth2.Config
	verifier *oidc.IDTokenVerifier
}

func NewOIDCClient(cfg OIDCConfig) *OIDCClient {
	base := cfg.HTTPClient
	if base == nil {
		base = &http.Client{Timeout: oidcHTTPTimeout}
	}
	tracker := &fetchTracker{}
	rt := base.Transport
	if rt == nil {
		rt = http.DefaultTransport
	}
	tracker.base = rt
	client := *base
	client.Transport = tracker

	return &OIDCClient{
		cfg:  cfg,
		http: &client,
		ctx:  oidc.ClientContext(context.Background(), &client),
		keys: tracker,
	}
}

// AuthorizeURL returns the IdP URL for one login attempt: PKCE S256 from the verifier,
// the nonce, scope openid only.
func (c *OIDCClient) AuthorizeURL(_ context.Context, state, nonce, verifier string) (string, error) {
	oauthCfg, _, err := c.discover()
	if err != nil {
		return "", err
	}
	return oauthCfg.AuthCodeURL(state, oauth2.S256ChallengeOption(verifier), oidc.Nonce(nonce)), nil
}

// Exchange trades the code for tokens and verifies the ID token. It returns the subject.
// Rejections by the IdP or the token are domain.ErrInvalidLogin; everything else is a
// fault. Errors never carry the code, the verifier, the secret or a response body.
func (c *OIDCClient) Exchange(ctx context.Context, code, verifier, nonce string) (string, error) {
	oauthCfg, verifier2, err := c.discover()
	if err != nil {
		return "", err
	}

	tok, err := oauthCfg.Exchange(context.WithValue(ctx, oauth2.HTTPClient, c.http), code, oauth2.VerifierOption(verifier))
	if err != nil {
		var re *oauth2.RetrieveError
		if errors.As(err, &re) {
			if re.ErrorCode == "invalid_grant" {
				return "", domain.ErrInvalidLogin
			}
			status := 0
			if re.Response != nil {
				status = re.Response.StatusCode
			}
			return "", fmt.Errorf("token exchange failed: status %d, code %q", status, re.ErrorCode)
		}
		return "", errors.New("token exchange failed: request error")
	}

	rawID, _ := tok.Extra("id_token").(string)
	if rawID == "" {
		return "", domain.ErrInvalidLogin
	}

	failuresBefore := c.keys.failures()
	idToken, err := verifier2.Verify(oidc.ClientContext(ctx, c.http), rawID)
	if err != nil {
		// go-oidc does not tell a bad signature from a failed key fetch by error type, so
		// the transport counts failed JWKS requests: a fetch that failed during this
		// verification is a fault, anything else is a bad token.
		if c.keys.failures() != failuresBefore || errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			return "", errors.New("id token verification failed: signing keys unavailable")
		}
		return "", domain.ErrInvalidLogin
	}
	if subtle.ConstantTimeCompare([]byte(idToken.Nonce), []byte(nonce)) != 1 {
		return "", domain.ErrInvalidLogin
	}
	if idToken.Subject == "" {
		return "", domain.ErrInvalidLogin
	}
	return idToken.Subject, nil
}

// discover finds the provider on first use and builds the OAuth config and the ID token
// verifier from it. A failure is returned and not cached, so the next call tries again.
func (c *OIDCClient) discover() (*oauth2.Config, *oidc.IDTokenVerifier, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.oauth != nil {
		return c.oauth, c.verifier, nil
	}

	provider, err := oidc.NewProvider(c.ctx, c.cfg.IssuerURL)
	if err != nil {
		return nil, nil, errors.New("identity provider discovery failed")
	}
	var meta struct {
		JWKSURL string `json:"jwks_uri"`
	}
	if err := provider.Claims(&meta); err != nil || meta.JWKSURL == "" {
		return nil, nil, errors.New("identity provider discovery document has no jwks_uri")
	}
	c.keys.setJWKSURL(meta.JWKSURL)

	c.oauth = &oauth2.Config{
		ClientID:     c.cfg.ClientID,
		ClientSecret: c.cfg.ClientSecret,
		RedirectURL:  c.cfg.RedirectURL,
		Endpoint:     provider.Endpoint(),
		Scopes:       []string{oidc.ScopeOpenID},
	}
	c.verifier = oidc.NewVerifier(c.cfg.IssuerURL, oidc.NewRemoteKeySet(c.ctx, meta.JWKSURL), &oidc.Config{
		ClientID:             c.cfg.ClientID,
		SupportedSigningAlgs: []string{oidc.RS256},
	})
	return c.oauth, c.verifier, nil
}

// fetchTracker is an http.RoundTripper that counts failed requests to the JWKS URL
// (transport errors and non-200 answers).
type fetchTracker struct {
	base http.RoundTripper

	mu      sync.Mutex
	jwksURL string
	failed  atomic.Int64
}

func (t *fetchTracker) setJWKSURL(u string) {
	t.mu.Lock()
	t.jwksURL = u
	t.mu.Unlock()
}

func (t *fetchTracker) failures() int64 { return t.failed.Load() }

func (t *fetchTracker) RoundTrip(req *http.Request) (*http.Response, error) {
	resp, err := t.base.RoundTrip(req)
	t.mu.Lock()
	isJWKS := t.jwksURL != "" && req.URL.String() == t.jwksURL
	t.mu.Unlock()
	if isJWKS && (err != nil || resp.StatusCode != http.StatusOK) {
		t.failed.Add(1)
	}
	return resp, err
}
