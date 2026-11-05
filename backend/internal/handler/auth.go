package handler

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"net/url"

	"github.com/google/uuid"

	"marker/internal/api"
	"marker/internal/domain"
	"marker/internal/handler/middleware"
	"marker/internal/usecase"
)

// LoginFlow is what the auth operations call. It is satisfied by usecase.LoginService.
// A nil LoginFlow means OIDC login is not configured.
type LoginFlow interface {
	Begin(ctx context.Context, returnTo string) (usecase.LoginAttempt, error)
	Complete(ctx context.Context, code, state, binding string) (grant usecase.Grant, returnTo string, err error)
	Logout(ctx context.Context, sessionID uuid.UUID) (logoutURL string, err error)
}

// AuthLogin implements GET /auth/login; it shadows the 501 stub. It answers 302 to the
// identity provider and sets the login_binding cookie that ties the attempt to this browser.
func (s *Server) AuthLogin(ctx context.Context, req api.AuthLoginRequestObject) (api.AuthLoginResponseObject, error) {
	if s.login == nil {
		return nil, ErrNotImplemented
	}
	returnTo := ""
	if req.Params.ReturnTo != nil {
		returnTo = *req.Params.ReturnTo
	}
	attempt, err := s.login.Begin(ctx, safeReturnTo(returnTo))
	if err != nil {
		return nil, err
	}
	if attempt.Binding == "" || attempt.MaxAge <= 0 {
		// A cookie from these would be empty or a session cookie: a fault, not a login.
		return nil, errors.New("login attempt has no usable binding")
	}
	cookie := loginBindingCookie(attempt.Binding, attempt.MaxAge, s.secureCookies).String()
	return api.AuthLogin302Response{Headers: api.AuthLogin302ResponseHeaders{
		Location: &attempt.AuthorizeURL, SetCookie: &cookie,
	}}, nil
}

// AuthCallback implements GET /auth/callback; it shadows the 501 stub. A browser
// navigation never gets JSON here: every failure redirects to /login?error=<code>.
func (s *Server) AuthCallback(ctx context.Context, req api.AuthCallbackRequestObject) (api.AuthCallbackResponseObject, error) {
	if s.login == nil {
		return nil, ErrNotImplemented
	}
	clearBinding := clearLoginBindingCookie(s.secureCookies)
	deref := func(p *string) string {
		if p == nil {
			return ""
		}
		return *p
	}

	// An empty code still gets the state verified, which yields the return_to for a retry.
	grant, returnTo, err := s.login.Complete(ctx, deref(req.Params.Code), deref(req.Params.State), loginBindingFrom(ctx))
	if err != nil {
		code := "login_failed"
		if deref(req.Params.Error) == "access_denied" {
			code = "access_denied"
		}
		if !errors.Is(err, domain.ErrInvalidLogin) {
			slog.ErrorContext(ctx, "login callback failed", "error", err)
		}
		q := url.Values{"error": {code}}
		if returnTo != "" {
			q.Set("return_to", safeReturnTo(returnTo))
		}
		return authCallbackRedirect{
			location: "/login?" + q.Encode(),
			cookies:  []*http.Cookie{clearBinding},
		}, nil
	}
	session, csrf := authCookies(grant, s.secureCookies)
	return authCallbackRedirect{
		// Validated again: the state is signed, but the open-redirect rule lives in one place.
		location: safeReturnTo(returnTo),
		cookies:  []*http.Cookie{session, csrf, clearBinding},
	}, nil
}

// authCallbackRedirect is the callback's 302. The generated response type carries one
// Set-Cookie string and a header cannot hold several cookies, so this one writes them all.
type authCallbackRedirect struct {
	location string
	cookies  []*http.Cookie
}

func (r authCallbackRedirect) VisitAuthCallbackResponse(w http.ResponseWriter) error {
	for _, c := range r.cookies {
		http.SetCookie(w, c)
	}
	w.Header().Set("Location", r.location)
	w.WriteHeader(http.StatusFound)
	return nil
}

// AuthLogout implements POST /auth/logout; it shadows the 501 stub. The session and CSRF
// checks are already done by the router.
func (s *Server) AuthLogout(ctx context.Context, _ api.AuthLogoutRequestObject) (api.AuthLogoutResponseObject, error) {
	if s.login == nil {
		return nil, ErrNotImplemented
	}
	auth, ok := middleware.AuthFrom(ctx)
	if !ok {
		return nil, domain.ErrUnauthenticated
	}
	logoutURL, err := s.login.Logout(ctx, auth.SessionID)
	if err != nil {
		return nil, err
	}
	return authLogoutResponse{logoutURL: logoutURL, secure: s.secureCookies}, nil
}

// authLogoutResponse is the logout 200. It clears both login cookies, which the generated
// response type cannot do: its Set-Cookie header holds one string.
type authLogoutResponse struct {
	logoutURL string
	secure    bool
}

func (r authLogoutResponse) VisitAuthLogoutResponse(w http.ResponseWriter) error {
	for _, name := range []string{middleware.SessionCookie, middleware.CSRFCookie} {
		http.SetCookie(w, &http.Cookie{
			Name: name, Path: "/", MaxAge: -1,
			HttpOnly: name == middleware.SessionCookie, Secure: r.secure, SameSite: http.SameSiteLaxMode,
		})
	}
	var resp api.AuthLogout200JSONResponse
	resp.Body.LogoutUrl = r.logoutURL
	return resp.VisitAuthLogoutResponse(w)
}
