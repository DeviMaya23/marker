package adaptor

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"net/http"
	"net/url"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"marker/internal/domain"
	"marker/internal/testutil"
)

const (
	testRedirectURL = "http://app.test/auth/callback"
	testVerifier    = "verifier-verifier-verifier-verifier-verifier"
	testNonce       = "nonce-1234"
)

func newOIDC(fake *testutil.FakeIDP) *OIDCClient {
	return NewOIDCClient(OIDCConfig{
		IssuerURL:    fake.Issuer(),
		ClientID:     testutil.FakeIDPClientID,
		ClientSecret: testutil.FakeIDPClientSecret,
		RedirectURL:  testRedirectURL,
	})
}

// issueCode makes a real request to the fake's authorize endpoint and returns the code
// it redirected back with. It builds the URL itself, so it works while discovery is down.
func issueCode(t *testing.T, fake *testutil.FakeIDP, verifier, nonce string) string {
	t.Helper()
	sum := sha256.Sum256([]byte(verifier))
	q := url.Values{
		"client_id":             {testutil.FakeIDPClientID},
		"redirect_uri":          {testRedirectURL},
		"response_type":         {"code"},
		"scope":                 {"openid"},
		"state":                 {"st"},
		"nonce":                 {nonce},
		"code_challenge":        {base64.RawURLEncoding.EncodeToString(sum[:])},
		"code_challenge_method": {"S256"},
	}
	return followAuthorize(t, fake.AuthorizeEndpoint()+"?"+q.Encode())
}

// followAuthorize requests an authorize URL without following the redirect and returns
// the code on the redirect back to the app.
func followAuthorize(t *testing.T, authorizeURL string) string {
	t.Helper()
	client := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	resp, err := client.Get(authorizeURL)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusFound, resp.StatusCode)
	loc, err := url.Parse(resp.Header.Get("Location"))
	require.NoError(t, err)
	require.Equal(t, testRedirectURL, loc.Scheme+"://"+loc.Host+loc.Path)
	return loc.Query().Get("code")
}

func TestOIDCClient_AuthorizeURL(t *testing.T) {
	fake := testutil.NewFakeIDP(t)
	c := newOIDC(fake)

	got, err := c.AuthorizeURL(context.Background(), "the-state", testNonce, testVerifier)
	require.NoError(t, err)

	u, err := url.Parse(got)
	require.NoError(t, err)
	require.Equal(t, fake.AuthorizeEndpoint(), u.Scheme+"://"+u.Host+u.Path)
	sum := sha256.Sum256([]byte(testVerifier))
	q := u.Query()
	require.Equal(t, testutil.FakeIDPClientID, q.Get("client_id"))
	require.Equal(t, testRedirectURL, q.Get("redirect_uri"))
	require.Equal(t, "code", q.Get("response_type"))
	require.Equal(t, "openid", q.Get("scope"))
	require.Equal(t, "the-state", q.Get("state"))
	require.Equal(t, testNonce, q.Get("nonce"))
	require.Equal(t, "S256", q.Get("code_challenge_method"))
	require.Equal(t, base64.RawURLEncoding.EncodeToString(sum[:]), q.Get("code_challenge"))
	require.Empty(t, q.Get("prompt"))
}

func TestOIDCClient_Exchange(t *testing.T) {
	fake := testutil.NewFakeIDP(t)
	fake.Configure(func(k *testutil.FakeIDPKnobs) { k.Subject = "sub-alice" })
	c := newOIDC(fake)

	authorizeURL, err := c.AuthorizeURL(context.Background(), "st", testNonce, testVerifier)
	require.NoError(t, err)
	code := followAuthorize(t, authorizeURL)

	sub, err := c.Exchange(context.Background(), code, testVerifier, testNonce)

	require.NoError(t, err)
	require.Equal(t, "sub-alice", sub)
	reqs := fake.TokenRequests()
	require.NotEmpty(t, reqs)
	last := reqs[len(reqs)-1]
	require.Equal(t, testutil.FakeIDPClientID, last.ClientID)
	require.Equal(t, testutil.FakeIDPClientSecret, last.ClientSecret)
	require.Equal(t, testRedirectURL, last.Form.Get("redirect_uri"))
	require.Equal(t, testVerifier, last.Form.Get("code_verifier"))
	require.Equal(t, "authorization_code", last.Form.Get("grant_type"))
}

func TestOIDCClient_Exchange_RejectsABadLogin(t *testing.T) {
	tests := []struct {
		name  string
		setup func(*testutil.FakeIDPKnobs)
	}{
		{"token endpoint answers invalid_grant", func(k *testutil.FakeIDPKnobs) { k.Token = testutil.TokenInvalidGrant }},
		{"wrong audience", func(k *testutil.FakeIDPKnobs) { k.IDToken = testutil.IDTokenWrongAud }},
		{"wrong issuer", func(k *testutil.FakeIDPKnobs) { k.IDToken = testutil.IDTokenWrongIss }},
		{"expired token", func(k *testutil.FakeIDPKnobs) { k.IDToken = testutil.IDTokenExpired }},
		{"wrong nonce", func(k *testutil.FakeIDPKnobs) { k.IDToken = testutil.IDTokenWrongNonce }},
		{"signed with another key", func(k *testutil.FakeIDPKnobs) { k.IDToken = testutil.IDTokenOtherKey }},
		{"alg none", func(k *testutil.FakeIDPKnobs) { k.IDToken = testutil.IDTokenAlgNone }},
		{"HS256 signed with the public key bytes", func(k *testutil.FakeIDPKnobs) { k.IDToken = testutil.IDTokenHS256 }},
		{"no id_token", func(k *testutil.FakeIDPKnobs) { k.IDToken = testutil.IDTokenMissing }},
		{"no sub", func(k *testutil.FakeIDPKnobs) { k.IDToken = testutil.IDTokenNoSub }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fake := testutil.NewFakeIDP(t)
			fake.Configure(tt.setup)
			c := newOIDC(fake)
			code := issueCode(t, fake, testVerifier, testNonce)

			_, err := c.Exchange(context.Background(), code, testVerifier, testNonce)

			require.ErrorIs(t, err, domain.ErrInvalidLogin)
			requireNoSecrets(t, err, code)
		})
	}

	t.Run("a code used twice", func(t *testing.T) {
		fake := testutil.NewFakeIDP(t)
		c := newOIDC(fake)
		code := issueCode(t, fake, testVerifier, testNonce)
		_, err := c.Exchange(context.Background(), code, testVerifier, testNonce)
		require.NoError(t, err)

		_, err = c.Exchange(context.Background(), code, testVerifier, testNonce)

		require.ErrorIs(t, err, domain.ErrInvalidLogin)
		requireNoSecrets(t, err, code)
	})
}

func TestOIDCClient_Exchange_ReportsAFaultAsAFault(t *testing.T) {
	tests := []struct {
		name  string
		setup func(*testutil.FakeIDPKnobs)
		close bool
	}{
		{"invalid_client", func(k *testutil.FakeIDPKnobs) { k.Token = testutil.TokenInvalidClient }, false},
		{"token endpoint 500", func(k *testutil.FakeIDPKnobs) { k.Token = testutil.TokenServerError }, false},
		{"JWKS 500", func(k *testutil.FakeIDPKnobs) { k.JWKSStatus = http.StatusInternalServerError }, false},
		{"discovery 500", func(k *testutil.FakeIDPKnobs) { k.DiscoveryStatus = http.StatusInternalServerError }, false},
		{"server closed", func(*testutil.FakeIDPKnobs) {}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fake := testutil.NewFakeIDP(t)
			code := issueCode(t, fake, testVerifier, testNonce)
			fake.Configure(tt.setup)
			if tt.close {
				fake.Server.Close()
			}
			c := newOIDC(fake)

			_, err := c.Exchange(context.Background(), code, testVerifier, testNonce)

			require.Error(t, err)
			require.NotErrorIs(t, err, domain.ErrInvalidLogin)
			requireNoSecrets(t, err, code)
		})
	}
}

func TestOIDCClient_Exchange_DoesNotLeakTheResponseBody(t *testing.T) {
	fake := testutil.NewFakeIDP(t)
	fake.Configure(func(k *testutil.FakeIDPKnobs) { k.Token = testutil.TokenInvalidClient })
	c := newOIDC(fake)

	_, err := c.Exchange(context.Background(), "some-code", testVerifier, testNonce)

	require.ErrorContains(t, err, "invalid_client")
	require.ErrorContains(t, err, "401")
	require.NotContains(t, err.Error(), "{")
}

func TestOIDCClient_LazyDiscovery(t *testing.T) {
	fake := testutil.NewFakeIDP(t)
	fake.Configure(func(k *testutil.FakeIDPKnobs) { k.DiscoveryStatus = http.StatusInternalServerError })

	c := newOIDC(fake)
	require.Zero(t, fake.Requests("discovery"), "creating the client makes no request")

	_, err := c.AuthorizeURL(context.Background(), "st", testNonce, testVerifier)
	require.Error(t, err)

	fake.Configure(func(k *testutil.FakeIDPKnobs) { k.DiscoveryStatus = 0 })
	_, err = c.AuthorizeURL(context.Background(), "st", testNonce, testVerifier)
	require.NoError(t, err, "a failed discovery does not poison the client")

	code := issueCode(t, fake, testVerifier, testNonce)
	_, err = c.Exchange(context.Background(), code, testVerifier, testNonce)
	require.NoError(t, err)
	require.Equal(t, 2, fake.Requests("discovery"), "discovery succeeded once and is then cached")
}

func requireNoSecrets(t *testing.T, err error, code string) {
	t.Helper()
	require.NotContains(t, err.Error(), testutil.FakeIDPClientSecret)
	if code != "" {
		require.False(t, strings.Contains(err.Error(), code), "error text holds the authorization code")
	}
}
