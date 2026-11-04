package usecase

import (
	"context"
	"encoding/base64"
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

// begin starts a login and returns the state the IdP received.
func begin(t *testing.T, svc *LoginService, idp *idpSpy, returnTo string) string {
	t.Helper()
	_, err := svc.Begin(context.Background(), returnTo)
	require.NoError(t, err)
	return idp.authorizeState
}

func TestLoginService_BeginThenComplete(t *testing.T) {
	for _, returnTo := range []string{"/", "/save?url=https%3A%2F%2Fa.test%2F&title=x%20y"} {
		t.Run(returnTo, func(t *testing.T) {
			svc, idp, sessions, _ := newTestLogin()

			u, err := svc.Begin(context.Background(), returnTo)
			require.NoError(t, err)
			require.Equal(t, "https://idp.test/authorize", u)

			grant, gotReturn, err := svc.Complete(context.Background(), "the-code", idp.authorizeState)
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

	s1 := begin(t, svc, idp, "/")
	n1 := idp.authorizeNonce
	s2 := begin(t, svc, idp, "/")

	require.NotEqual(t, s1, s2)
	require.NotEqual(t, n1, idp.authorizeNonce)
}

func TestLoginService_VerifierIsDerivedPerAttemptAndNotInTheState(t *testing.T) {
	svc, idp, _, _ := newTestLogin()

	s1 := begin(t, svc, idp, "/")
	v1 := idp.authorizeVerifier
	_ = begin(t, svc, idp, "/")

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
	state := begin(t, svc, idp, hostile)
	require.LessOrEqual(t, len(state), maxStateLen)

	_, gotReturn, err := svc.Complete(context.Background(), "c", state)
	require.NoError(t, err)
	require.Equal(t, "/", gotReturn)
}

func TestLoginService_BeginKeepsTheLongestAllowedReturnTo(t *testing.T) {
	svc, idp, _, _ := newTestLogin()

	longest := "/" + strings.Repeat("a", 8191)
	state := begin(t, svc, idp, longest)
	require.LessOrEqual(t, len(state), maxStateLen)

	_, gotReturn, err := svc.Complete(context.Background(), "c", state)
	require.NoError(t, err)
	require.Equal(t, longest, gotReturn)
}

func TestLoginService_CompleteRejectsABadAttempt(t *testing.T) {
	svc, idp, sessions, _ := newTestLogin()
	good := begin(t, svc, idp, "/")
	payload, sig, _ := strings.Cut(good, ".")

	other := NewLoginService(idp, sessions, LoginConfig{StateSecret: []byte(strings.Repeat("x", 32))})
	other.now = svc.now
	foreign := begin(t, other, idp, "/")

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
		name        string
		code, state string
	}{
		{"empty state", "c", ""},
		{"no dot", "c", payload + sig},
		{"two dots", "c", good + ".x"},
		{"half is not base64url", "c", "!!!." + sig},
		{"signature is not base64url", "c", payload + ".!!!"},
		{"tampered payload", "c", flip(payload) + "." + sig},
		{"tampered signature", "c", payload + "." + flip(sig)},
		{"signed with another secret", "c", foreign},
		{"empty code", "", good},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, _, err := svc.Complete(context.Background(), tt.code, tt.state)
			require.ErrorIs(t, err, domain.ErrInvalidLogin)
			require.Zero(t, idp.exchangeCalls)
			require.Zero(t, sessions.startCalls)
		})
	}
}

func TestLoginService_CompleteRejectsAStateMissingAField(t *testing.T) {
	svc, idp, sessions, _ := newTestLogin()

	for name, st := range map[string]loginState{
		"no nonce":     {ReturnTo: "/", Expires: t0.Add(time.Minute).Unix()},
		"no return_to": {Nonce: "n", Expires: t0.Add(time.Minute).Unix()},
		"no expiry":    {Nonce: "n", ReturnTo: "/"},
	} {
		t.Run(name, func(t *testing.T) {
			state, err := signState(testSecret, st)
			require.NoError(t, err)
			_, _, err = svc.Complete(context.Background(), "c", state)
			require.ErrorIs(t, err, domain.ErrInvalidLogin)
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
		_, _, err := svc.Complete(context.Background(), "c", strings.Repeat("a", maxStateLen+1))
		require.ErrorIs(t, err, domain.ErrInvalidLogin)
		require.Zero(t, idp.exchangeCalls)
	})

	t.Run("a state of 12288 bytes is decoded and refused for its signature", func(t *testing.T) {
		svc, idp, _, _ := newTestLogin()
		good := begin(t, svc, idp, "/")
		payload, _, _ := strings.Cut(good, ".")
		// Valid base64url halves, wrong signature, exactly at the cap.
		state := payload + "." + strings.Repeat("A", maxStateLen-len(payload)-1)
		require.Len(t, state, maxStateLen)

		_, _, err := svc.Complete(context.Background(), "c", state)
		require.ErrorIs(t, err, domain.ErrInvalidLogin)
		require.Zero(t, idp.exchangeCalls)
	})

	t.Run("a correctly signed state is accepted at 12288 bytes and refused just above", func(t *testing.T) {
		svc, _, _, _ := newTestLogin()
		signedOfLen := func(n int) string {
			for pad := 1; pad < n; pad++ {
				st, err := signState(testSecret, loginState{Nonce: "n", ReturnTo: "/" + strings.Repeat("a", pad), Expires: t0.Add(time.Minute).Unix()})
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

		_, _, err := svc.Complete(context.Background(), "c", signedOfLen(maxStateLen))
		require.NoError(t, err)
		// 12289 cannot be built: the payload's base64 length would be 1 mod 4. 12290 is the
		// nearest signed state above the cap.
		_, _, err = svc.Complete(context.Background(), "c", signedOfLen(maxStateLen+2))
		require.ErrorIs(t, err, domain.ErrInvalidLogin)
	})

	t.Run("a code of 2049 bytes is refused, 2048 reaches the IdP", func(t *testing.T) {
		svc, idp, _, _ := newTestLogin()
		state := begin(t, svc, idp, "/")

		_, _, err := svc.Complete(context.Background(), strings.Repeat("c", maxCodeLen+1), state)
		require.ErrorIs(t, err, domain.ErrInvalidLogin)
		require.Zero(t, idp.exchangeCalls)

		_, _, err = svc.Complete(context.Background(), strings.Repeat("c", maxCodeLen), state)
		require.NoError(t, err)
		require.Equal(t, 1, idp.exchangeCalls)
	})
}

func TestLoginService_StateExpiry(t *testing.T) {
	svc, idp, _, now := newTestLogin()
	state := begin(t, svc, idp, "/")
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
			_, _, err := svc.Complete(context.Background(), "c", state)
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
	state := begin(t, svc, idp, "/")
	idp.exchangeErr = errors.New("token endpoint down")

	_, _, err := svc.Complete(context.Background(), "c", state)

	require.Error(t, err)
	require.NotErrorIs(t, err, domain.ErrInvalidLogin, "a fault must become a 500, not a 400")
	require.Zero(t, sessions.startCalls)
}

func TestLoginService_CompleteRejectsAnEmptySubject(t *testing.T) {
	svc, idp, sessions, _ := newTestLogin()
	state := begin(t, svc, idp, "/")
	idp.subject = ""

	_, _, err := svc.Complete(context.Background(), "c", state)

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
