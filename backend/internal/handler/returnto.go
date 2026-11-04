package handler

import (
	"net/url"
	"strings"
)

// maxReturnToLen caps a return_to value in bytes. It covers the longest save-page path
// NFR-14 allows (a 2,048-character URL and a 300-character title, percent-encoded).
const maxReturnToLen = 8192

// safeReturnTo validates the `return_to` query parameter of the login routes. Only a
// same-origin relative path is accepted; anything else becomes "/". This prevents the
// login flow from being used as an open redirect. A value over maxReturnToLen also
// becomes "/".
func safeReturnTo(raw string) string {
	if raw == "" || len(raw) > maxReturnToLen || raw[0] != '/' || strings.HasPrefix(raw, "//") || strings.ContainsAny(raw, "\\\r\n") {
		return "/"
	}
	u, err := url.Parse(raw)
	if err != nil || u.IsAbs() || u.Host != "" {
		return "/"
	}
	return raw
}
