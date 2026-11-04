package handler

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/require"

	"marker/internal/adaptor"
	"marker/internal/domain"
	"marker/internal/testutil"
	"marker/internal/usecase"
)

// This is the one test file that crosses layers on purpose (see docs/tasks/auth-backend.md):
// the router, the real LoginService, the real OIDC client and the fake identity provider
// make the whole round trip, with an in-memory session manager and no database.

// memorySessions is the in-memory SessionManager and the router's authenticator in one,
// so the cookie the callback sets authenticates the logout, and EndSession removes it.
type memorySessions struct {
	mu      sync.Mutex
	byToken map[string]uuid.UUID // session token -> session id
	subs    map[uuid.UUID]string // session id -> idp subject
	started []string             // every subject StartSession was called with
}

func newMemorySessions() *memorySessions {
	return &memorySessions{byToken: map[string]uuid.UUID{}, subs: map[uuid.UUID]string{}}
}

func (m *memorySessions) StartSession(_ context.Context, idpID string) (usecase.Grant, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	token := base64.RawURLEncoding.EncodeToString(b)
	id := uuid.New()
	m.byToken[token] = id
	m.subs[id] = idpID
	m.started = append(m.started, idpID)
	return usecase.Grant{Token: token, CSRFToken: "csrf", ExpiresAt: time.Now().Add(time.Hour)}, nil
}

func (m *memorySessions) EndSession(_ context.Context, id uuid.UUID) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for token, sid := range m.byToken {
		if sid == id {
			delete(m.byToken, token)
		}
	}
	delete(m.subs, id)
	return nil
}

func (m *memorySessions) Authenticate(_ context.Context, token string) (domain.Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	id, ok := m.byToken[token]
	if !ok {
		return domain.Session{}, domain.ErrUnauthenticated
	}
	return domain.Session{ID: id, UserID: uuid.New()}, nil
}

func (m *memorySessions) count() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.byToken)
}

func (m *memorySessions) startedSubs() []string {
	m.mu.Lock()
	defer m.mu.Unlock()
	return append([]string(nil), m.started...)
}

const flowStateSecret = "flow-test-state-secret-0123456789abcdef"

type flowEnv struct {
	fake     *testutil.FakeIDP
	sessions *memorySessions
	router   *echo.Echo
	idp      *adaptor.OIDCClient
}

func newFlowEnv(t *testing.T) *flowEnv {
	t.Helper()
	fake := testutil.NewFakeIDP(t)
	idp := adaptor.NewOIDCClient(adaptor.OIDCConfig{
		IssuerURL:    fake.Issuer(),
		ClientID:     testutil.FakeIDPClientID,
		ClientSecret: testutil.FakeIDPClientSecret,
		RedirectURL:  testOrigin + "/auth/callback",
	})
	sessions := newMemorySessions()
	svc := usecase.NewLoginService(idp, sessions, usecase.LoginConfig{
		StateSecret:     []byte(flowStateSecret),
		LogoutURL:       fake.LogoutEndpoint(),
		LogoutReturnURL: testOrigin + "/",
	})
	router := NewRouter(Deps{
		Server:    NewServer(nil, nil, nil, nil, nil, svc, false),
		Auth:      sessions,
		AppOrigin: testOrigin,
	})
	return &flowEnv{fake: fake, sessions: sessions, router: router, idp: idp}
}

// noFollow requests a URL on the fake without following redirects and returns the Location.
func noFollow(t *testing.T, rawURL string) string {
	t.Helper()
	client := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	resp, err := client.Get(rawURL)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusFound, resp.StatusCode)
	return resp.Header.Get("Location")
}

// startLogin calls /auth/login on the router and returns the identity provider URL.
func (e *flowEnv) startLogin(t *testing.T, returnTo string) string {
	t.Helper()
	rec := do(e.router, http.MethodGet, "/auth/login?return_to="+url.QueryEscape(returnTo))
	require.Equal(t, http.StatusFound, rec.Code)
	loc := rec.Header().Get("Location")
	require.True(t, strings.HasPrefix(loc, e.fake.AuthorizeEndpoint()+"?"), loc)
	return loc
}

// callbackPath turns the fake's redirect back to the app into a path and query for the router.
func callbackPathFrom(t *testing.T, location string) string {
	t.Helper()
	u, err := url.Parse(location)
	require.NoError(t, err)
	require.Equal(t, testOrigin, u.Scheme+"://"+u.Host)
	require.Equal(t, "/auth/callback", u.Path)
	return u.RequestURI()
}

func TestAuthFlow_LoginRoundTrip(t *testing.T) {
	e := newFlowEnv(t)
	e.fake.Configure(func(k *testutil.FakeIDPKnobs) { k.Subject = "sub-alice" })
	returnTo := "/save?url=https%3A%2F%2Fa.test%2F%26x&title=t"

	authorizeURL := e.startLogin(t, returnTo)
	callback := callbackPathFrom(t, noFollow(t, authorizeURL))
	rec := do(e.router, http.MethodGet, callback)

	require.Equal(t, http.StatusFound, rec.Code)
	require.Equal(t, returnTo, rec.Header().Get("Location"))
	cookies := rec.Result().Cookies()
	require.Len(t, cookies, 2)
	session := cookieByName(t, cookies, "session")
	require.True(t, session.HttpOnly)
	cookieByName(t, cookies, "csrf_token")
	require.Equal(t, 1, e.sessions.count())
	require.Equal(t, []string{"sub-alice"}, e.sessions.startedSubs())
}

func TestAuthFlow_ReplayedCallbackIsRefused(t *testing.T) {
	e := newFlowEnv(t)
	callback := callbackPathFrom(t, noFollow(t, e.startLogin(t, "/")))

	require.Equal(t, http.StatusFound, do(e.router, http.MethodGet, callback).Code)
	rec := do(e.router, http.MethodGet, callback)

	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Equal(t, 1, e.sessions.count())
}

func TestAuthFlow_DeniedLoginIsRefused(t *testing.T) {
	e := newFlowEnv(t)
	e.fake.Configure(func(k *testutil.FakeIDPKnobs) { k.DenyLogin = true })

	callback := callbackPathFrom(t, noFollow(t, e.startLogin(t, "/")))
	require.NotContains(t, callback, "code=")
	rec := do(e.router, http.MethodGet, callback)

	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Zero(t, e.sessions.count())
}

func TestAuthFlow_StateSignedWithAnotherSecretIsRefused(t *testing.T) {
	e := newFlowEnv(t)
	foreign := usecase.NewLoginService(e.idp, e.sessions, usecase.LoginConfig{StateSecret: []byte("another-secret-another-secret-123456")})
	authorizeURL, err := foreign.Begin(context.Background(), "/")
	require.NoError(t, err)

	rec := do(e.router, http.MethodGet, callbackPathFrom(t, noFollow(t, authorizeURL)))

	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Zero(t, e.fake.Requests("token"), "the token endpoint is never called for a bad state")
	require.Zero(t, e.sessions.count())
}

func TestAuthFlow_Logout(t *testing.T) {
	e := newFlowEnv(t)
	callback := callbackPathFrom(t, noFollow(t, e.startLogin(t, "/")))
	login := do(e.router, http.MethodGet, callback)
	token := cookieByName(t, login.Result().Cookies(), "session").Value
	require.Equal(t, 1, e.sessions.count())

	rec := do(e.router, http.MethodPost, "/auth/logout", withSession(token), withCSRF())

	require.Equal(t, http.StatusOK, rec.Code)
	var body struct {
		LogoutURL string `json:"logout_url"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	u, err := url.Parse(body.LogoutURL)
	require.NoError(t, err)
	require.Equal(t, e.fake.LogoutEndpoint(), u.Scheme+"://"+u.Host+u.Path)
	require.Equal(t, testOrigin+"/", u.Query().Get("redirect"))
	require.Zero(t, e.sessions.count(), "the app session is gone")

	require.Equal(t, testOrigin+"/", noFollow(t, body.LogoutURL))
	require.Len(t, e.fake.LogoutRequests(), 1)
	require.Equal(t, testOrigin+"/", e.fake.LogoutRequests()[0].Get("redirect"))

	again := do(e.router, http.MethodPost, "/auth/logout", withSession(token), withCSRF())
	require.Equal(t, http.StatusUnauthorized, again.Code, "the cookie is dead after logout")
}

func TestAuthFlow_SameSubjectTwice(t *testing.T) {
	e := newFlowEnv(t)
	e.fake.Configure(func(k *testutil.FakeIDPKnobs) { k.Subject = "sub-bob" })

	for range 2 {
		callback := callbackPathFrom(t, noFollow(t, e.startLogin(t, "/")))
		require.Equal(t, http.StatusFound, do(e.router, http.MethodGet, callback).Code)
	}

	require.Equal(t, []string{"sub-bob", "sub-bob"}, e.sessions.startedSubs())
}

func TestAuthFlow_ConcurrentCallbacksStartOneSession(t *testing.T) {
	e := newFlowEnv(t)
	callback := callbackPathFrom(t, noFollow(t, e.startLogin(t, "/")))

	const n = 8
	codes := make([]int, n)
	var wg sync.WaitGroup
	for i := range n {
		wg.Add(1)
		go func() {
			defer wg.Done()
			codes[i] = do(e.router, http.MethodGet, callback).Code
		}()
	}
	wg.Wait()

	ok, bad := 0, 0
	for _, c := range codes {
		switch c {
		case http.StatusFound:
			ok++
		case http.StatusBadRequest:
			bad++
		}
	}
	require.Equal(t, 1, ok, "codes: %v", codes)
	require.Equal(t, n-1, bad, "codes: %v", codes)
	require.Equal(t, 1, e.sessions.count())
}

func TestAuthFlow_ReturnToThroughTheWholeRoundTrip(t *testing.T) {
	tests := []struct {
		name, returnTo, want string
	}{
		{"backslash", `/\evil.test`, "/"},
		{"encoded double slash stays a path", "/%2f%2fevil.test", "/%2f%2fevil.test"},
		{"CRLF", "/a\r\nSet-Cookie: x=1", "/"},
		{"NUL byte", "/a\x00b", "/"},
		{"absolute URL", "https://evil.test/", "/"},
		{"8192 bytes is kept", "/" + strings.Repeat("a", 8191), "/" + strings.Repeat("a", 8191)},
		{"8193 bytes becomes root", "/" + strings.Repeat("a", 8192), "/"},
		{"every byte a quote falls back to root", "/" + strings.Repeat(`"`, 8191), "/"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			e := newFlowEnv(t)
			callback := callbackPathFrom(t, noFollow(t, e.startLogin(t, tt.returnTo)))
			rec := do(e.router, http.MethodGet, callback)

			require.Equal(t, http.StatusFound, rec.Code)
			require.Equal(t, tt.want, rec.Header().Get("Location"))
			require.Len(t, rec.Result().Cookies(), 2, "no header was injected")
		})
	}
}

func TestAuthFlow_EmptyCodeIsRefusedWithoutCallingTheIdP(t *testing.T) {
	e := newFlowEnv(t)
	u, err := url.Parse(callbackPathFrom(t, noFollow(t, e.startLogin(t, "/"))))
	require.NoError(t, err)
	q := u.Query()
	q.Set("code", "")

	rec := do(e.router, http.MethodGet, "/auth/callback?"+q.Encode())

	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Zero(t, e.fake.Requests("token"))
}

func TestAuthFlow_LogoutDoesNotDependOnTheIdPBeingUp(t *testing.T) {
	e := newFlowEnv(t)
	login := do(e.router, http.MethodGet, callbackPathFrom(t, noFollow(t, e.startLogin(t, "/"))))
	token := cookieByName(t, login.Result().Cookies(), "session").Value
	e.fake.Server.Close()

	rec := do(e.router, http.MethodPost, "/auth/logout", withSession(token), withCSRF())

	require.Equal(t, http.StatusOK, rec.Code)
	require.Zero(t, e.sessions.count())
}
