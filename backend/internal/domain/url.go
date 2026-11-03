package domain

import (
	"net/url"
	"sort"
	"strings"
)

// trackingParams are query parameters that identify a campaign or click, not a page.
// NormalizeURL drops them (FR-22). Extend this list to ignore more; the "utm_" prefix
// is handled separately in isTrackingParam.
var trackingParams = map[string]bool{
	"fbclid":  true,
	"gclid":   true,
	"dclid":   true,
	"msclkid": true,
	"yclid":   true,
	"mc_cid":  true,
	"mc_eid":  true,
	"igshid":  true,
}

func isTrackingParam(key string) bool {
	k := strings.ToLower(key)
	return strings.HasPrefix(k, "utm_") || trackingParams[k]
}

// ParseBookmarkURL parses a submitted URL and accepts only http and https URLs with a
// host (FR-4). It returns ErrInvalidURL otherwise.
func ParseBookmarkURL(raw string) (*url.URL, error) {
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" {
		return nil, ErrInvalidURL
	}
	return u, nil
}

// NormalizeURL returns the duplicate-detection key for a URL (FR-22): http and https
// are the same (stored as https), the host is lowercase, the default port of the
// scheme is dropped, a trailing slash on the path and the fragment are ignored,
// tracking parameters are removed, and the remaining parameters are sorted by key
// then value. It returns ErrInvalidURL for a URL that ParseBookmarkURL rejects.
//
// The query is split here rather than with url.Query(), which silently drops a pair
// it cannot parse (a ";" or a bad escape) and would make two different pages share
// one key. Such a pair is kept as written.
func NormalizeURL(raw string) (string, error) {
	u, err := ParseBookmarkURL(raw)
	if err != nil {
		return "", err
	}

	var b strings.Builder
	b.WriteString("https://")
	if u.User != nil {
		b.WriteString(u.User.String())
		b.WriteByte('@')
	}
	host := strings.ToLower(u.Hostname())
	if strings.Contains(host, ":") { // an IPv6 literal
		host = "[" + host + "]"
	}
	b.WriteString(host)
	if port := u.Port(); port != "" && !isDefaultPort(u.Scheme, port) {
		b.WriteByte(':')
		b.WriteString(port)
	}
	// EscapedPath keeps the encoding as written, so "/a%2F" and "/a" stay different.
	b.WriteString(strings.TrimRight(u.EscapedPath(), "/"))
	if q := normalizeQuery(u.RawQuery); q != "" {
		b.WriteByte('?')
		b.WriteString(q)
	}
	return b.String(), nil
}

func isDefaultPort(scheme, port string) bool {
	return (scheme == "http" && port == "80") || (scheme == "https" && port == "443")
}

// normalizeQuery drops tracking parameters and sorts the rest by key then value.
func normalizeQuery(rawQuery string) string {
	type pair struct{ k, v string }
	var pairs []pair
	for _, part := range strings.Split(rawQuery, "&") {
		if part == "" {
			continue
		}
		rawKey, rawVal, _ := strings.Cut(part, "=")
		key, kerr := url.QueryUnescape(rawKey)
		val, verr := url.QueryUnescape(rawVal)
		if kerr != nil || verr != nil {
			// Not valid percent-encoding: keep the pair verbatim so it still
			// distinguishes this URL from others.
			pairs = append(pairs, pair{rawKey, rawVal})
			continue
		}
		if isTrackingParam(key) {
			continue
		}
		pairs = append(pairs, pair{url.QueryEscape(key), url.QueryEscape(val)})
	}
	sort.Slice(pairs, func(i, j int) bool {
		if pairs[i].k != pairs[j].k {
			return pairs[i].k < pairs[j].k
		}
		return pairs[i].v < pairs[j].v
	})
	parts := make([]string, len(pairs))
	for i, p := range pairs {
		parts[i] = p.k + "=" + p.v
	}
	return strings.Join(parts, "&")
}
