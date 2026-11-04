package testutil

import (
	"crypto"
	"crypto/hmac"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/subtle"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sync"
	"testing"
	"time"
)

// Credentials the fake identity provider expects from the app.
const (
	FakeIDPClientID     = "fake-client-id"
	FakeIDPClientSecret = "fake-client-secret"
)

// IDTokenFault makes the fake sign a deliberately bad ID token.
type IDTokenFault int

const (
	IDTokenOK         IDTokenFault = iota
	IDTokenWrongAud                // audience is another client
	IDTokenWrongIss                // issuer is another provider
	IDTokenExpired                 // expired an hour ago
	IDTokenWrongNonce              // nonce differs from the authorize request's
	IDTokenOtherKey                // signed with a key the JWKS does not hold
	IDTokenAlgNone                 // alg=none, no signature
	IDTokenHS256                   // HS256, keyed with the public key bytes
	IDTokenMissing                 // the token response has no id_token
	IDTokenNoSub                   // no sub claim
)

// TokenFault makes the token endpoint answer with an error.
type TokenFault int

const (
	TokenOK            TokenFault = iota
	TokenInvalidGrant             // 400 {"error":"invalid_grant"}
	TokenInvalidClient            // 401 {"error":"invalid_client"}
	TokenServerError              // 500
)

// FakeIDPKnobs are the switches of the fake. The zero value is a well-behaved provider.
type FakeIDPKnobs struct {
	Subject         string       // sub to issue; default "fake-sub-1"
	DenyLogin       bool         // /authorize redirects with error=access_denied and no code
	IDToken         IDTokenFault // what is wrong with the ID token
	Token           TokenFault   // make the token endpoint fail
	JWKSStatus      int          // when non-zero, /jwks answers with this status
	DiscoveryStatus int          // when non-zero, discovery answers with this status
	LogoutParam     string       // query parameter /logout redirects to; default "redirect"
}

// FakeIDPTokenRequest is one request the token endpoint received.
type FakeIDPTokenRequest struct {
	Form         url.Values
	ClientID     string // as presented, by Basic auth or in the form
	ClientSecret string
}

// FakeIDP is an OIDC provider for tests: discovery, authorize, token, JWKS and logout,
// served by httptest. It checks what a real provider checks (client credentials, grant
// type, redirect URI, a code that exists and is unused, the PKCE verifier) and signs
// RS256 ID tokens by hand with the standard library.
type FakeIDP struct {
	Server *httptest.Server

	mu         sync.Mutex
	knobs      FakeIDPKnobs
	codes      map[string]fakeCode
	counts     map[string]int
	authorizes []url.Values
	tokens     []FakeIDPTokenRequest
	logouts    []url.Values
}

type fakeCode struct {
	challenge, redirectURI, nonce, subject string
}

var (
	fakeKeysOnce       sync.Once
	fakeKey, fakeOther *rsa.PrivateKey
)

func fakeKeys(t testing.TB) (*rsa.PrivateKey, *rsa.PrivateKey) {
	t.Helper()
	fakeKeysOnce.Do(func() {
		var err error
		if fakeKey, err = rsa.GenerateKey(rand.Reader, 2048); err != nil {
			panic(err)
		}
		if fakeOther, err = rsa.GenerateKey(rand.Reader, 2048); err != nil {
			panic(err)
		}
	})
	return fakeKey, fakeOther
}

// NewFakeIDP starts a fake provider and closes it when the test ends.
func NewFakeIDP(t testing.TB) *FakeIDP {
	t.Helper()
	fakeKeys(t)

	f := &FakeIDP{codes: map[string]fakeCode{}, counts: map[string]int{}}
	mux := http.NewServeMux()
	mux.HandleFunc("/.well-known/openid-configuration", f.discovery)
	mux.HandleFunc("/authorize", f.authorize)
	mux.HandleFunc("/token", f.token)
	mux.HandleFunc("/jwks", f.jwks)
	mux.HandleFunc("/logout", f.logout)
	f.Server = httptest.NewServer(mux)
	t.Cleanup(f.Server.Close)
	return f
}

// Configure changes the knobs under the fake's lock.
func (f *FakeIDP) Configure(fn func(*FakeIDPKnobs)) {
	f.mu.Lock()
	defer f.mu.Unlock()
	fn(&f.knobs)
}

func (f *FakeIDP) Issuer() string            { return f.Server.URL }
func (f *FakeIDP) AuthorizeEndpoint() string { return f.Server.URL + "/authorize" }
func (f *FakeIDP) LogoutEndpoint() string    { return f.Server.URL + "/logout" }

// Requests counts the requests an endpoint received: "discovery", "authorize", "token",
// "jwks" or "logout".
func (f *FakeIDP) Requests(endpoint string) int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.counts[endpoint]
}

// AuthorizeRequests are the query strings /authorize received.
func (f *FakeIDP) AuthorizeRequests() []url.Values {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]url.Values(nil), f.authorizes...)
}

// TokenRequests are the requests the token endpoint received.
func (f *FakeIDP) TokenRequests() []FakeIDPTokenRequest {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]FakeIDPTokenRequest(nil), f.tokens...)
}

// LogoutRequests are the query strings /logout received.
func (f *FakeIDP) LogoutRequests() []url.Values {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]url.Values(nil), f.logouts...)
}

func (f *FakeIDP) count(endpoint string) FakeIDPKnobs {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.counts[endpoint]++
	return f.knobs
}

func (f *FakeIDP) discovery(w http.ResponseWriter, _ *http.Request) {
	k := f.count("discovery")
	if k.DiscoveryStatus != 0 {
		http.Error(w, "discovery down", k.DiscoveryStatus)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"issuer":                                f.Server.URL,
		"authorization_endpoint":                f.Server.URL + "/authorize",
		"token_endpoint":                        f.Server.URL + "/token",
		"jwks_uri":                              f.Server.URL + "/jwks",
		"response_types_supported":              []string{"code"},
		"subject_types_supported":               []string{"public"},
		"id_token_signing_alg_values_supported": []string{"RS256"},
	})
}

func (f *FakeIDP) authorize(w http.ResponseWriter, r *http.Request) {
	k := f.count("authorize")
	q := r.URL.Query()
	f.mu.Lock()
	f.authorizes = append(f.authorizes, q)
	f.mu.Unlock()

	redirect := q.Get("redirect_uri")
	if q.Get("client_id") != FakeIDPClientID || q.Get("response_type") != "code" || redirect == "" ||
		q.Get("code_challenge_method") != "S256" || q.Get("code_challenge") == "" {
		http.Error(w, "bad authorize request", http.StatusBadRequest)
		return
	}

	back := url.Values{"state": {q.Get("state")}}
	if k.DenyLogin {
		back.Set("error", "access_denied")
	} else {
		code := randomString()
		subject := k.Subject
		if subject == "" {
			subject = "fake-sub-1"
		}
		f.mu.Lock()
		f.codes[code] = fakeCode{q.Get("code_challenge"), redirect, q.Get("nonce"), subject}
		f.mu.Unlock()
		back.Set("code", code)
	}
	http.Redirect(w, r, redirect+"?"+back.Encode(), http.StatusFound)
}

func (f *FakeIDP) token(w http.ResponseWriter, r *http.Request) {
	k := f.count("token")
	if r.Method != http.MethodPost || r.ParseForm() != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	id, secret, basic := r.BasicAuth()
	if !basic {
		id, secret = r.PostForm.Get("client_id"), r.PostForm.Get("client_secret")
	}
	f.mu.Lock()
	f.tokens = append(f.tokens, FakeIDPTokenRequest{Form: r.PostForm, ClientID: id, ClientSecret: secret})
	f.mu.Unlock()

	switch k.Token {
	case TokenServerError:
		http.Error(w, "boom", http.StatusInternalServerError)
		return
	case TokenInvalidClient:
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid_client"})
		return
	case TokenInvalidGrant:
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_grant"})
		return
	}

	if id != FakeIDPClientID || subtle.ConstantTimeCompare([]byte(secret), []byte(FakeIDPClientSecret)) != 1 {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid_client"})
		return
	}
	if r.PostForm.Get("grant_type") != "authorization_code" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "unsupported_grant_type"})
		return
	}

	// Consuming the code is atomic: two simultaneous requests cannot both get it.
	f.mu.Lock()
	rec, ok := f.codes[r.PostForm.Get("code")]
	delete(f.codes, r.PostForm.Get("code"))
	f.mu.Unlock()
	sum := sha256.Sum256([]byte(r.PostForm.Get("code_verifier")))
	if !ok || r.PostForm.Get("redirect_uri") != rec.redirectURI ||
		b64url(sum[:]) != rec.challenge {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_grant"})
		return
	}

	resp := map[string]any{"access_token": "fake-access-token", "token_type": "Bearer", "expires_in": 3600}
	if k.IDToken != IDTokenMissing {
		resp["id_token"] = f.idToken(k.IDToken, rec)
	}
	writeJSON(w, http.StatusOK, resp)
}

func (f *FakeIDP) idToken(fault IDTokenFault, rec fakeCode) string {
	now := time.Now()
	claims := map[string]any{
		"iss":   f.Server.URL,
		"sub":   rec.subject,
		"aud":   []string{FakeIDPClientID},
		"exp":   now.Add(time.Hour).Unix(),
		"iat":   now.Unix(),
		"nonce": rec.nonce,
	}
	header := map[string]any{"alg": "RS256", "typ": "JWT", "kid": "fake-key-1"}
	key, other := fakeKey, fakeOther
	signingKey := key

	switch fault {
	case IDTokenWrongAud:
		claims["aud"] = []string{"another-client"}
	case IDTokenWrongIss:
		claims["iss"] = "https://another-issuer.test"
	case IDTokenExpired:
		claims["exp"] = now.Add(-time.Hour).Unix()
		claims["iat"] = now.Add(-2 * time.Hour).Unix()
	case IDTokenWrongNonce:
		claims["nonce"] = "not-the-nonce"
	case IDTokenOtherKey:
		signingKey = other
	case IDTokenNoSub:
		delete(claims, "sub")
	}

	signingInput := func() string {
		h, _ := json.Marshal(header)
		c, _ := json.Marshal(claims)
		return b64url(h) + "." + b64url(c)
	}

	switch fault {
	case IDTokenAlgNone:
		header["alg"] = "none"
		return signingInput() + "."
	case IDTokenHS256:
		header["alg"] = "HS256"
		pub, _ := x509.MarshalPKIXPublicKey(&key.PublicKey)
		input := signingInput()
		m := hmac.New(sha256.New, pub)
		m.Write([]byte(input))
		return input + "." + b64url(m.Sum(nil))
	}

	input := signingInput()
	digest := sha256.Sum256([]byte(input))
	sig, err := rsa.SignPKCS1v15(rand.Reader, signingKey, crypto.SHA256, digest[:])
	if err != nil {
		panic(err)
	}
	return input + "." + b64url(sig)
}

func (f *FakeIDP) jwks(w http.ResponseWriter, _ *http.Request) {
	k := f.count("jwks")
	if k.JWKSStatus != 0 {
		http.Error(w, "jwks down", k.JWKSStatus)
		return
	}
	pub := fakeKey.PublicKey
	writeJSON(w, http.StatusOK, map[string]any{"keys": []map[string]string{{
		"kty": "RSA", "use": "sig", "alg": "RS256", "kid": "fake-key-1",
		"n": b64url(pub.N.Bytes()),
		"e": b64url(big.NewInt(int64(pub.E)).Bytes()),
	}}})
}

func (f *FakeIDP) logout(w http.ResponseWriter, r *http.Request) {
	k := f.count("logout")
	q := r.URL.Query()
	f.mu.Lock()
	f.logouts = append(f.logouts, q)
	f.mu.Unlock()

	param := k.LogoutParam
	if param == "" {
		param = "redirect"
	}
	http.Redirect(w, r, q.Get(param), http.StatusFound)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func b64url(b []byte) string { return base64.RawURLEncoding.EncodeToString(b) }

func randomString() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return b64url(b)
}
