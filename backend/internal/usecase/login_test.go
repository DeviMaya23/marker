package usecase

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"marker/internal/domain"
)

// idpSpy is a value-return spy for IdentityProvider: it records what it receives and
// returns what the test configured.
type idpSpy struct {
	authorizeState, authorizeNonce, authorizeVerifier string
	authorizeCalls                                    int

	exchangeCode, exchangeVerifier, exchangeNonce string
	exchangeCalls                                 int

	subject     string
	exchangeErr error
}

func (s *idpSpy) AuthorizeURL(_ context.Context, state, nonce, verifier string) (string, error) {
	s.authorizeCalls++
	s.authorizeState, s.authorizeNonce, s.authorizeVerifier = state, nonce, verifier
	return "https://idp.test/authorize", nil
}

func (s *idpSpy) Exchange(_ context.Context, code, verifier, nonce string) (string, error) {
	s.exchangeCalls++
	s.exchangeCode, s.exchangeVerifier, s.exchangeNonce = code, verifier, nonce
	return s.subject, s.exchangeErr
}

// sessionsSpy is a value-return spy for SessionManager.
type sessionsSpy struct {
	startCalls int
	startSub   string
	grant      Grant
	startErr   error

	endedID  uuid.UUID
	endCalls int
	endErr   error
}

func (s *sessionsSpy) StartSession(_ context.Context, idpID string) (Grant, error) {
	s.startCalls++
	s.startSub = idpID
	return s.grant, s.startErr
}

func (s *sessionsSpy) EndSession(_ context.Context, id uuid.UUID) error {
	s.endCalls++
	s.endedID = id
	return s.endErr
}

var testSecret = []byte(strings.Repeat("k", 32))

func newTestLogin() (*LoginService, *idpSpy, *sessionsSpy, *time.Time) {
	idp := &idpSpy{subject: "sub-alice"}
	sessions := &sessionsSpy{grant: Grant{Token: "tok", CSRFToken: "csrf", ExpiresAt: t0.Add(90 * day)}}
	svc := NewLoginService(idp, sessions, LoginConfig{
		StateSecret:     testSecret,
		LogoutURL:       "https://idp.test/logout",
		LogoutReturnURL: "http://localhost:5175/",
	})
	now := t0
	svc.now = func() time.Time { return now }
	return svc, idp, sessions, &now
}

// begin starts a login and returns the state the IdP received and the binding value.
func begin(t *testing.T, svc *LoginService, idp *idpSpy, returnTo string) (state, binding string) {
	t.Helper()
	a, err := svc.Begin(context.Background(), returnTo)
	require.NoError(t, err)
	return idp.authorizeState, a.Binding
}

// signedState hand-signs a state with a valid binding hash for binding.
func signedState(t *testing.T, st loginState) string {
	t.Helper()
	state, err := signState(testSecret, st)
	require.NoError(t, err)
	return state
}

func TestLoginService_BeginThenComplete(t *testing.T) {
	for _, returnTo := range []string{"/", "/save?url=https%3A%2F%2Fa.test%2F&title=x%20y"} {
		t.Run(returnTo, func(t *testing.T) {
			svc, idp, sessions, _ := newTestLogin()

			a, err := svc.Begin(context.Background(), returnTo)
			require.NoError(t, err)
			require.Equal(t, "https://idp.test/authorize", a.AuthorizeURL)

			grant, gotReturn, err := svc.Complete(context.Background(), "the-code", idp.authorizeState, a.Binding)
			require.NoError(t, err)

			require.Equal(t, "the-code", idp.exchangeCode)
			require.Equal(t, idp.authorizeVerifier, idp.exchangeVerifier)
			require.Equal(t, idp.authorizeNonce, idp.exchangeNonce)
			require.Len(t, idp.authorizeVerifier, 43)
			require.Equal(t, "sub-alice", sessions.startSub, "StartSession receives the sub and nothing else")
			require.Equal(t, returnTo, gotReturn)
			require.Equal(t, sessions.grant, grant)
		})
	}
}

func TestLoginService_BeginMintsFreshStateAndNonce(t *testing.T) {
	svc, idp, _, _ := newTestLogin()

	s1, _ := begin(t, svc, idp, "/")
	n1 := idp.authorizeNonce
	s2, _ := begin(t, svc, idp, "/")

	require.NotEqual(t, s1, s2)
	require.NotEqual(t, n1, idp.authorizeNonce)
}

func TestLoginService_VerifierIsDerivedPerAttemptAndNotInTheState(t *testing.T) {
	svc, idp, _, _ := newTestLogin()

	s1, _ := begin(t, svc, idp, "/")
	v1 := idp.authorizeVerifier
	_, _ = begin(t, svc, idp, "/")

	require.Len(t, v1, 43)
	require.NotEqual(t, v1, idp.authorizeVerifier, "each attempt has its own verifier")
	require.Equal(t, b64(mac(testSecret, []byte("pkce:"+idp.authorizeNonce))), idp.authorizeVerifier)
	require.NotContains(t, s1, v1)
	payload, _, _ := strings.Cut(s1, ".")
	raw, err := base64.RawURLEncoding.DecodeString(payload)
	require.NoError(t, err)
	require.NotContains(t, string(raw), v1, "the verifier is not stored in the state")
}

func TestLoginService_BeginFallsBackWhenStateWouldBeTooLong(t *testing.T) {
	svc, idp, _, _ := newTestLogin()

	// 8191 double quotes: each takes two bytes in JSON, so the state exceeds maxStateLen.
	hostile := "/" + strings.Repeat(`"`, 8191)
	state, binding := begin(t, svc, idp, hostile)
	require.LessOrEqual(t, len(state), maxStateLen)

	_, gotReturn, err := svc.Complete(context.Background(), "c", state, binding)
	require.NoError(t, err)
	require.Equal(t, "/", gotReturn)
}

func TestLoginService_BeginKeepsTheLongestAllowedReturnTo(t *testing.T) {
	svc, idp, _, _ := newTestLogin()

	longest := "/" + strings.Repeat("a", 8191)
	state, binding := begin(t, svc, idp, longest)
	require.LessOrEqual(t, len(state), maxStateLen)

	_, gotReturn, err := svc.Complete(context.Background(), "c", state, binding)
	require.NoError(t, err)
	require.Equal(t, longest, gotReturn)
}

func TestLoginService_CompleteRejectsABadAttempt(t *testing.T) {
	svc, idp, sessions, _ := newTestLogin()
	good, binding := begin(t, svc, idp, "/")
	payload, sig, _ := strings.Cut(good, ".")

	other := NewLoginService(idp, sessions, LoginConfig{StateSecret: []byte(strings.Repeat("x", 32))})
	other.now = svc.now
	foreign, foreignBinding := begin(t, other, idp, "/")

	// Flip the first character: the last base64url character of a 32-byte MAC carries
	// two padding bits, so flipping it can decode to the same bytes and the test would
	// pass or fail at random.
	flip := func(s string) string {
		repl := byte('A')
		if s[0] == 'A' {
			repl = 'B'
		}
		return string(repl) + s[1:]
	}

	tests := []struct {
		name                 string
		code, state, binding string
	}{
		{"empty state", "c", "", binding},
		{"no dot", "c", payload + sig, binding},
		{"two dots", "c", good + ".x", binding},
		{"half is not base64url", "c", "!!!." + sig, binding},
		{"signature is not base64url", "c", payload + ".!!!", binding},
		{"tampered payload", "c", flip(payload) + "." + sig, binding},
		{"tampered signature", "c", payload + "." + flip(sig), binding},
		{"signed with another secret", "c", foreign, foreignBinding},
		{"empty code", "", good, binding},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, rt, err := svc.Complete(context.Background(), tt.code, tt.state, tt.binding)
			require.ErrorIs(t, err, domain.ErrInvalidLogin)
			if tt.name != "empty code" {
				require.Empty(t, rt, "a bad state yields no return_to")
			}
			require.Zero(t, idp.exchangeCalls)
			require.Zero(t, sessions.startCalls)
		})
	}
}

func TestLoginService_CompleteRejectsAStateMissingAField(t *testing.T) {
	svc, idp, sessions, _ := newTestLogin()
	exp := t0.Add(time.Minute).Unix()
	hash := bindingHash(testSecret, "v")

	for name, st := range map[string]loginState{
		"no nonce":                  {ReturnTo: "/", Expires: exp, Binding: hash},
		"no return_to":              {Nonce: "n", Expires: exp, Binding: hash},
		"no expiry":                 {Nonce: "n", ReturnTo: "/", Binding: hash},
		"no binding":                {Nonce: "n", ReturnTo: "/", Expires: exp},
		"binding not base64url":     {Nonce: "n", ReturnTo: "/", Expires: exp, Binding: "!!!" + hash[3:]},
		"binding 31 bytes":          {Nonce: "n", ReturnTo: "/", Expires: exp, Binding: b64(make([]byte, 31))},
		"binding 33 bytes":          {Nonce: "n", ReturnTo: "/", Expires: exp, Binding: b64(make([]byte, 33))},
		"binding with padding char": {Nonce: "n", ReturnTo: "/", Expires: exp, Binding: hash + "="},
	} {
		t.Run(name, func(t *testing.T) {
			_, rt, err := svc.Complete(context.Background(), "c", signedState(t, st), "v")
			require.ErrorIs(t, err, domain.ErrInvalidLogin)
			require.Empty(t, rt)
			require.Zero(t, idp.exchangeCalls)
			require.Zero(t, sessions.startCalls)
		})
	}
}

func TestLoginService_CompleteSizeLimits(t *testing.T) {
	t.Run("a state of 12289 bytes is refused before decoding", func(t *testing.T) {
		svc, idp, _, _ := newTestLogin()
		// A well-formed, correctly signed state padded past the cap would still be refused:
		// the length check comes first.
		_, _, err := svc.Complete(context.Background(), "c", strings.Repeat("a", maxStateLen+1), "v")
		require.ErrorIs(t, err, domain.ErrInvalidLogin)
		require.Zero(t, idp.exchangeCalls)
	})

	t.Run("a state of 12288 bytes is decoded and refused for its signature", func(t *testing.T) {
		svc, idp, _, _ := newTestLogin()
		good, _ := begin(t, svc, idp, "/")
		payload, _, _ := strings.Cut(good, ".")
		// Valid base64url halves, wrong signature, exactly at the cap.
		state := payload + "." + strings.Repeat("A", maxStateLen-len(payload)-1)
		require.Len(t, state, maxStateLen)

		_, _, err := svc.Complete(context.Background(), "c", state, "v")
		require.ErrorIs(t, err, domain.ErrInvalidLogin)
		require.Zero(t, idp.exchangeCalls)
	})

	t.Run("a correctly signed state is accepted at 12288 bytes and refused just above", func(t *testing.T) {
		svc, _, _, _ := newTestLogin()
		signedOfLen := func(n int) string {
			for pad := 1; pad < n; pad++ {
				st, err := signState(testSecret, loginState{Nonce: "n", ReturnTo: "/" + strings.Repeat("a", pad), Expires: t0.Add(time.Minute).Unix(), Binding: bindingHash(testSecret, "v")})
				require.NoError(t, err)
				if len(st) == n {
					return st
				}
				if len(st) > n {
					break
				}
			}
			t.Fatalf("cannot build a signed state of %d bytes", n)
			return ""
		}

		_, _, err := svc.Complete(context.Background(), "c", signedOfLen(maxStateLen), "v")
		require.NoError(t, err)
		// 12289 cannot be built: the payload's base64 length would be 1 mod 4. 12290 is the
		// nearest signed state above the cap.
		_, _, err = svc.Complete(context.Background(), "c", signedOfLen(maxStateLen+2), "v")
		require.ErrorIs(t, err, domain.ErrInvalidLogin)
	})

	t.Run("a binding of 129 bytes is refused even when it matches, 128 is accepted", func(t *testing.T) {
		svc, idp, _, _ := newTestLogin()
		stateFor := func(binding string) string {
			return signedState(t, loginState{Nonce: "n", ReturnTo: "/", Expires: t0.Add(time.Minute).Unix(), Binding: bindingHash(testSecret, binding)})
		}

		long := strings.Repeat("b", maxBindingLen+1)
		_, rt, err := svc.Complete(context.Background(), "c", stateFor(long), long)
		require.ErrorIs(t, err, domain.ErrInvalidLogin)
		require.Equal(t, "/", rt)
		require.Zero(t, idp.exchangeCalls)

		ok := strings.Repeat("b", maxBindingLen)
		_, _, err = svc.Complete(context.Background(), "c", stateFor(ok), ok)
		require.NoError(t, err)
	})

	t.Run("a code of 2049 bytes is refused, 2048 reaches the IdP", func(t *testing.T) {
		svc, idp, _, _ := newTestLogin()
		state, binding := begin(t, svc, idp, "/")

		_, _, err := svc.Complete(context.Background(), strings.Repeat("c", maxCodeLen+1), state, binding)
		require.ErrorIs(t, err, domain.ErrInvalidLogin)
		require.Zero(t, idp.exchangeCalls)

		_, _, err = svc.Complete(context.Background(), strings.Repeat("c", maxCodeLen), state, binding)
		require.NoError(t, err)
		require.Equal(t, 1, idp.exchangeCalls)
	})
}

func TestLoginService_StateExpiry(t *testing.T) {
	svc, idp, _, now := newTestLogin()
	state, binding := begin(t, svc, idp, "/")
	expiry := t0.Add(loginStateTTL)

	tests := []struct {
		name    string
		at      time.Time
		invalid bool
	}{
		{"one second before the expiry", expiry.Add(-time.Second), false},
		{"at the expiry second", expiry, true},
		{"one second after the expiry", expiry.Add(time.Second), true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			*now = tt.at
			_, _, err := svc.Complete(context.Background(), "c", state, binding)
			if tt.invalid {
				require.ErrorIs(t, err, domain.ErrInvalidLogin)
				return
			}
			require.NoError(t, err)
		})
	}
}

func TestLoginService_CompleteKeepsAnIdPFaultApartFromABadLogin(t *testing.T) {
	svc, idp, sessions, _ := newTestLogin()
	state, binding := begin(t, svc, idp, "/")
	idp.exchangeErr = errors.New("token endpoint down")

	_, _, err := svc.Complete(context.Background(), "c", state, binding)

	require.Error(t, err)
	require.NotErrorIs(t, err, domain.ErrInvalidLogin, "a fault must become a 500, not a 400")
	require.Zero(t, sessions.startCalls)
}

func TestLoginService_CompleteRejectsAnEmptySubject(t *testing.T) {
	svc, idp, sessions, _ := newTestLogin()
	state, binding := begin(t, svc, idp, "/")
	idp.subject = ""

	_, _, err := svc.Complete(context.Background(), "c", state, binding)

	require.ErrorIs(t, err, domain.ErrInvalidLogin)
	require.Zero(t, sessions.startCalls)
}

func TestLoginService_Logout(t *testing.T) {
	id := uuid.New()

	tests := []struct {
		name string
		cfg  LoginConfig
		want string
	}{
		{"default parameter, return address encoded",
			LoginConfig{LogoutURL: "https://idp.test/logout", LogoutReturnURL: "http://localhost:5175/"},
			"https://idp.test/logout?redirect=http%3A%2F%2Flocalhost%3A5175%2F"},
		{"existing query is kept",
			LoginConfig{LogoutURL: "https://idp.test/logout?client=abc", LogoutReturnURL: "http://localhost:5175/"},
			"https://idp.test/logout?client=abc&redirect=http%3A%2F%2Flocalhost%3A5175%2F"},
		{"custom parameter name",
			LoginConfig{LogoutURL: "https://idp.test/logout", LogoutRedirectParam: "post_logout_redirect_uri", LogoutReturnURL: "http://localhost:5175/"},
			"https://idp.test/logout?post_logout_redirect_uri=http%3A%2F%2Flocalhost%3A5175%2F"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sessions := &sessionsSpy{}
			svc := NewLoginService(&idpSpy{}, sessions, tt.cfg)

			got, err := svc.Logout(context.Background(), id)

			require.NoError(t, err)
			require.Equal(t, tt.want, got)
			require.Equal(t, id, sessions.endedID)
			u, err := url.Parse(got)
			require.NoError(t, err)
			require.Equal(t, tt.cfg.LogoutReturnURL, u.Query().Get(orDefault(tt.cfg.LogoutRedirectParam, "redirect")))
		})
	}

	t.Run("an EndSession error returns no URL", func(t *testing.T) {
		endErr := errors.New("db down")
		sessions := &sessionsSpy{endErr: endErr}
		svc := NewLoginService(&idpSpy{}, sessions, LoginConfig{LogoutURL: "https://idp.test/logout"})

		got, err := svc.Logout(context.Background(), id)

		require.ErrorIs(t, err, endErr)
		require.Empty(t, got)
	})
}

func orDefault(v, def string) string {
	if v == "" {
		return def
	}
	return v
}

func TestLoginService_CompleteKeepsReturnToOnceStateVerified(t *testing.T) {
	svc, idp, _, _ := newTestLogin()
	state, binding := begin(t, svc, idp, "/save?x=1")

	_, returnTo, err := svc.Complete(context.Background(), "", state, binding)

	require.ErrorIs(t, err, domain.ErrInvalidLogin)
	require.Equal(t, "/save?x=1", returnTo)

	_, returnTo, err = svc.Complete(context.Background(), "c", "garbage", binding)
	require.ErrorIs(t, err, domain.ErrInvalidLogin)
	require.Empty(t, returnTo, "an unverified state yields no return_to")
}

func TestLoginService_BeginReturnsABinding(t *testing.T) {
	svc, idp, _, _ := newTestLogin()

	a1, err := svc.Begin(context.Background(), "/")
	require.NoError(t, err)
	state1 := idp.authorizeState
	a2, err := svc.Begin(context.Background(), "/")
	require.NoError(t, err)

	require.Len(t, a1.Binding, 43)
	raw, err := base64.RawURLEncoding.DecodeString(a1.Binding)
	require.NoError(t, err)
	require.Len(t, raw, 32)
	require.Equal(t, 600, a1.MaxAge)
	require.NotEqual(t, a1.Binding, a2.Binding)

	payload, _, _ := strings.Cut(state1, ".")
	decoded, err := base64.RawURLEncoding.DecodeString(payload)
	require.NoError(t, err)
	var st loginState
	require.NoError(t, json.Unmarshal(decoded, &st))
	require.Len(t, st.Binding, 43)
	require.Equal(t, bindingHash(testSecret, a1.Binding), st.Binding)
	require.NotContains(t, string(decoded), a1.Binding, "the binding value is not in the state")
	require.NotContains(t, state1, a1.Binding)
	require.NotContains(t, a1.AuthorizeURL, a1.Binding)
}

func TestLoginService_BeginMintsOneBindingForTheFallbackState(t *testing.T) {
	svc, idp, _, _ := newTestLogin()

	state, binding := begin(t, svc, idp, "/"+strings.Repeat(`"`, 8191))

	_, rt, err := svc.Complete(context.Background(), "c", state, binding)
	require.NoError(t, err)
	require.Equal(t, "/", rt, "the fallback state carries the same binding the cookie gets")
}

func TestLoginService_CompleteRequiresTheBinding(t *testing.T) {
	svc, idp, sessions, _ := newTestLogin()
	state, binding := begin(t, svc, idp, "/save?x=1")
	_, otherBinding := begin(t, svc, idp, "/")

	t.Run("the right binding succeeds", func(t *testing.T) {
		_, _, err := svc.Complete(context.Background(), "c", state, binding)
		require.NoError(t, err)
		require.Equal(t, 1, idp.exchangeCalls)
	})

	for name, b := range map[string]string{
		"no binding":       "",
		"a wrong binding":  otherBinding,
		"a guessed value":  "x",
		"the state itself": state,
	} {
		t.Run(name+" is refused before the IdP is called", func(t *testing.T) {
			calls, started := idp.exchangeCalls, sessions.startCalls

			_, rt, err := svc.Complete(context.Background(), "c", state, b)

			require.ErrorIs(t, err, domain.ErrInvalidLogin)
			require.Equal(t, "/save?x=1", rt, "the verified state's return_to comes back")
			require.Equal(t, calls, idp.exchangeCalls)
			require.Equal(t, started, sessions.startCalls)
		})
	}
}
