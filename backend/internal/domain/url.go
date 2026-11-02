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
// are the same (stored as https), the host is lowercase, a trailing slash on the path
// and the fragment are ignored, tracking parameters are removed, and the remaining
// parameters are sorted by key then value. It returns ErrInvalidURL for a URL that
// ParseBookmarkURL rejects.
func NormalizeURL(raw string) (string, error) {
	u, err := ParseBookmarkURL(raw)
	if err != nil {
		return "", err
	}

	n := url.URL{
		Scheme: "https",
		User:   u.User,
		Host:   strings.ToLower(u.Host),
		Path:   strings.TrimRight(u.Path, "/"),
	}
	if u.RawPath != "" {
		n.RawPath = strings.TrimRight(u.RawPath, "/")
	}

	type pair struct{ k, v string }
	var pairs []pair
	for k, vs := range u.Query() {
		if isTrackingParam(k) {
			continue
		}
		for _, v := range vs {
			pairs = append(pairs, pair{k, v})
		}
	}
	sort.Slice(pairs, func(i, j int) bool {
		if pairs[i].k != pairs[j].k {
			return pairs[i].k < pairs[j].k
		}
		return pairs[i].v < pairs[j].v
	})
	var parts []string
	for _, p := range pairs {
		parts = append(parts, url.QueryEscape(p.k)+"="+url.QueryEscape(p.v))
	}
	n.RawQuery = strings.Join(parts, "&")
	return n.String(), nil
}
