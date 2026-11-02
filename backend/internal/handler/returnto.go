package handler

import (
	"net/url"
	"strings"
)

// safeReturnTo validates the `return_to` query parameter of the login routes. Only a
// same-origin relative path is accepted; anything else becomes "/". This prevents the
// login flow from being used as an open redirect.
func safeReturnTo(raw string) string {
	if raw == "" || raw[0] != '/' || strings.HasPrefix(raw, "//") || strings.ContainsAny(raw, "\\\r\n") {
		return "/"
	}
	u, err := url.Parse(raw)
	if err != nil || u.IsAbs() || u.Host != "" {
		return "/"
	}
	return raw
}
