package usecase

import (
	"bytes"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"marker/internal/domain"
)

const (
	// loginStateTTL is how long a login attempt may take, from the redirect to the IdP
	// until the callback.
	loginStateTTL = 10 * time.Minute
	// maxStateLen caps the state accepted at the callback, in bytes, checked before any
	// decoding. The longest state Begin mints (a return_to of maxReturnToLen bytes) is
	// about 11 KB, below it.
	maxStateLen = 12288
	// maxCodeLen caps the authorization code accepted at the callback, in bytes.
	maxCodeLen = 2048
	// maxBindingLen caps the login_binding cookie value accepted at the callback, in bytes.
	maxBindingLen = 128
)

// loginState is the signed payload of the login `state` parameter. It carries what the
// callback needs and nothing else: the nonce (also sent to the IdP as `nonce`, and the
// input of the PKCE verifier), where to return to, when the attempt expires, and the hash
// of the binding value that only the browser that started the attempt holds.
type loginState struct {
	Nonce    string `json:"n"`
	ReturnTo string `json:"r"`
	Expires  int64  `json:"e"` // Unix seconds
	Binding  string `json:"b"` // base64url(HMAC-SHA256(secret, "bind:" + binding value))
}

// signState returns base64url(payload) + "." + base64url(HMAC-SHA256(secret, payload)),
// without padding.
func signState(secret []byte, st loginState) (string, error) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false) // keep '&' one byte
	if err := enc.Encode(st); err != nil {
		return "", fmt.Errorf("encode login state: %w", err)
	}
	payload := bytes.TrimRight(buf.Bytes(), "\n")
	return b64(payload) + "." + b64(mac(secret, payload)), nil
}

// verifyState checks a state received at the callback and returns its payload. Every
// failure is domain.ErrInvalidLogin.
func verifyState(secret []byte, state string, now time.Time) (loginState, error) {
	if len(state) > maxStateLen {
		return loginState{}, domain.ErrInvalidLogin
	}
	parts := strings.Split(state, ".")
	if len(parts) != 2 {
		return loginState{}, domain.ErrInvalidLogin
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return loginState{}, domain.ErrInvalidLogin
	}
	sig, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return loginState{}, domain.ErrInvalidLogin
	}
	if !hmac.Equal(sig, mac(secret, payload)) {
		return loginState{}, domain.ErrInvalidLogin
	}

	var st loginState
	if err := json.Unmarshal(payload, &st); err != nil {
		return loginState{}, domain.ErrInvalidLogin
	}
	if st.Nonce == "" || st.ReturnTo == "" || st.Expires == 0 {
		return loginState{}, domain.ErrInvalidLogin
	}
	if now.Unix() >= st.Expires {
		return loginState{}, domain.ErrInvalidLogin
	}
	if h, err := base64.RawURLEncoding.DecodeString(st.Binding); err != nil || len(h) != sha256.Size {
		return loginState{}, domain.ErrInvalidLogin
	}
	return st, nil
}

// bindingHash is what the state stores for a binding value:
// base64url(HMAC-SHA256(secret, "bind:" + value)), 43 characters.
func bindingHash(secret []byte, binding string) string {
	return b64(mac(secret, []byte("bind:"+binding)))
}

// bindingMatches reports whether binding, the login_binding cookie value, is the one
// the verified state was minted for. An empty or over-long value never matches.
func bindingMatches(secret []byte, st loginState, binding string) bool {
	if binding == "" || len(binding) > maxBindingLen {
		return false
	}
	want, err := base64.RawURLEncoding.DecodeString(st.Binding)
	if err != nil {
		return false
	}
	return hmac.Equal(want, mac(secret, []byte("bind:"+binding)))
}

// pkceVerifier derives the PKCE code verifier for a login attempt from its nonce, so it
// need not travel in the state: base64url(HMAC-SHA256(secret, "pkce:" + nonce)), 43
// characters.
func pkceVerifier(secret []byte, nonce string) string {
	return b64(mac(secret, []byte("pkce:"+nonce)))
}

func newNonce() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate nonce: %w", err)
	}
	return b64(b), nil
}

func mac(secret, msg []byte) []byte {
	h := hmac.New(sha256.New, secret)
	h.Write(msg)
	return h.Sum(nil)
}

func b64(b []byte) string { return base64.RawURLEncoding.EncodeToString(b) }
