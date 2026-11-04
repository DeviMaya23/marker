package handler

import (
	"context"
	"net/http"

	"github.com/google/uuid"

	"marker/internal/api"
	"marker/internal/domain"
	"marker/internal/handler/middleware"
	"marker/internal/usecase"
)

// LoginFlow is what the auth operations call. It is satisfied by usecase.LoginService.
// A nil LoginFlow means OIDC login is not configured.
type LoginFlow interface {
	Begin(ctx context.Context, returnTo string) (authorizeURL string, err error)
	Complete(ctx context.Context, code, state string) (grant usecase.Grant, returnTo string, err error)
	Logout(ctx context.Context, sessionID uuid.UUID) (logoutURL string, err error)
}

// AuthLogin implements GET /auth/login; it shadows the 501 stub. It answers 302 to the
// identity provider and sets no cookie.
func (s *Server) AuthLogin(ctx context.Context, req api.AuthLoginRequestObject) (api.AuthLoginResponseObject, error) {
	if s.login == nil {
		return nil, ErrNotImplemented
	}
	returnTo := ""
	if req.Params.ReturnTo != nil {
		returnTo = *req.Params.ReturnTo
	}
	location, err := s.login.Begin(ctx, safeReturnTo(returnTo))
	if err != nil {
		return nil, err
	}
	return api.AuthLogin302Response{Headers: api.AuthLogin302ResponseHeaders{Location: &location}}, nil
}

// AuthCallback implements GET /auth/callback; it shadows the 501 stub. A missing code or
// state never reaches here: the generated wrapper answers 400.
func (s *Server) AuthCallback(ctx context.Context, req api.AuthCallbackRequestObject) (api.AuthCallbackResponseObject, error) {
	if s.login == nil {
		return nil, ErrNotImplemented
	}
	grant, returnTo, err := s.login.Complete(ctx, req.Params.Code, req.Params.State)
	if err != nil {
		return nil, err
	}
	session, csrf := authCookies(grant, s.secureCookies)
	return authCallbackRedirect{
		// Validated again: the state is signed, but the open-redirect rule lives in one place.
		location: safeReturnTo(returnTo),
		cookies:  []*http.Cookie{session, csrf},
	}, nil
}

// authCallbackRedirect is the callback's 302. The generated response type carries one
// Set-Cookie string and a header cannot hold two cookies, so this one writes both.
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
	return api.AuthLogout200JSONResponse{LogoutUrl: logoutURL}, nil
}
