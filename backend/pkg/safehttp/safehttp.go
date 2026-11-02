// Package safehttp is an HTTP client for fetching URLs that users supplied
// (NFR-8, NFR-9). It exists so a bookmarked URL cannot be used to make the
// server talk to its own network.
//
// What it enforces:
//
//   - Only http and https URLs, with a host and no embedded credentials.
//   - The address actually connected to is checked, not the hostname. The check
//     runs in the dialer, after DNS resolution, so a name that resolves to a
//     private address (or flips to one between lookups) is refused. Redirects
//     are covered because every hop dials again.
//   - Blocked addresses: loopback, private, link-local (including the cloud
//     metadata address), unspecified, multicast, shared and reserved ranges,
//     and IPv6 forms that embed IPv4 (IPv4-mapped, NAT64, 6to4).
//   - Only ports 80 and 443.
//   - Environment proxies are ignored. A proxy would connect on the client's
//     behalf and bypass the dial check.
//   - A hop limit on redirects, an overall timeout, a response size cap counted
//     on decompressed bytes, a content-type allowlist and a 2xx-only rule.
//
// Callers get the whole body back already capped, so a size limit cannot be
// forgotten.
package safehttp

import (
	"context"
	"errors"
	"fmt"
	"io"
	"mime"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"
)

// Errors returned (wrapped) by Client.Get. Test with errors.Is, or errors.As
// for *StatusError.
var (
	ErrInvalidURL             = errors.New("safehttp: invalid url")
	ErrBlockedAddress         = errors.New("safehttp: blocked address")
	ErrBlockedPort            = errors.New("safehttp: blocked port")
	ErrTooManyRedirects       = errors.New("safehttp: too many redirects")
	ErrTooLarge               = errors.New("safehttp: response too large")
	ErrUnsupportedContentType = errors.New("safehttp: unsupported content type")
	ErrInvalidLimits          = errors.New("safehttp: invalid limits")
)

// StatusError is returned for any non-2xx final response.
type StatusError struct {
	Code int
}

func (e *StatusError) Error() string {
	return fmt.Sprintf("safehttp: unexpected status %d", e.Code)
}

// Limits bounds one fetch.
type Limits struct {
	// MaxBytes is the largest accepted body, counted after decompression.
	// Must be positive. A larger body is an error (ErrTooLarge), not truncated.
	MaxBytes int64
	// ContentTypes are the accepted media types, lowercase, without parameters
	// (for example "text/html"). A missing Content-Type is rejected.
	ContentTypes []string
}

var (
	// PageLimits are the limits for fetching a page to extract text from.
	PageLimits = Limits{
		MaxBytes:     2 << 20,
		ContentTypes: []string{"text/html", "application/xhtml+xml"},
	}
	// FaviconLimits are the limits for fetching a favicon. SVG is left out on
	// purpose: it can carry script, and a favicon does not need it.
	FaviconLimits = Limits{
		MaxBytes: 256 << 10,
		ContentTypes: []string{
			"image/png",
			"image/x-icon",
			"image/vnd.microsoft.icon",
			"image/jpeg",
			"image/gif",
			"image/webp",
		},
	}
)

// Response is a fully read, size-checked response.
type Response struct {
	// FinalURL is the URL of the last response, after redirects.
	FinalURL *url.URL
	// ContentType is the lowercase media type without parameters.
	ContentType string
	Body        []byte
}

const (
	defaultTimeout      = 10 * time.Second
	defaultMaxRedirects = 5
	defaultUserAgent    = "marker-fetcher/1.0"
)

type config struct {
	timeout       time.Duration
	maxRedirects  int
	userAgent     string
	allowLoopback bool
	anyPort       bool
}

// Option adjusts a Client. None of them can weaken the address rules.
type Option func(*config)

// WithTimeout sets the overall deadline for one Get, including redirects and
// reading the body. The caller's context can shorten it further.
func WithTimeout(d time.Duration) Option { return func(c *config) { c.timeout = d } }

// WithMaxRedirects sets how many redirects are followed.
func WithMaxRedirects(n int) Option { return func(c *config) { c.maxRedirects = n } }

// WithUserAgent sets the User-Agent header.
func WithUserAgent(ua string) Option { return func(c *config) { c.userAgent = ua } }

// Client fetches URLs safely. It is safe for concurrent use.
type Client struct {
	hc           *http.Client
	maxRedirects int
	userAgent    string
}

// New returns the production client. It has no way to allow loopback addresses
// or other ports.
func New(opts ...Option) *Client {
	return newClient(config{
		timeout:      defaultTimeout,
		maxRedirects: defaultMaxRedirects,
		userAgent:    defaultUserAgent,
	}, opts)
}

// NewForTesting returns a client that also allows loopback addresses and any
// port, so tests can use httptest servers. Every other address rule still
// applies. Taking a testing.TB keeps it out of non-test code.
func NewForTesting(tb testing.TB, opts ...Option) *Client {
	tb.Helper()
	return newClient(config{
		timeout:       defaultTimeout,
		maxRedirects:  defaultMaxRedirects,
		userAgent:     defaultUserAgent,
		allowLoopback: true,
		anyPort:       true,
	}, opts)
}

func newClient(cfg config, opts []Option) *Client {
	for _, o := range opts {
		o(&cfg)
	}
	c := &Client{maxRedirects: cfg.maxRedirects, userAgent: cfg.userAgent}

	dialer := &net.Dialer{
		Timeout: 5 * time.Second,
		Control: cfg.control,
	}
	transport := &http.Transport{
		// Proxy is deliberately nil: see the package comment.
		Proxy:                  nil,
		DialContext:            dialer.DialContext,
		ForceAttemptHTTP2:      true,
		TLSHandshakeTimeout:    5 * time.Second,
		MaxResponseHeaderBytes: 64 << 10,
		DisableKeepAlives:      true,
	}
	c.hc = &http.Client{
		Transport:     transport,
		Timeout:       cfg.timeout,
		CheckRedirect: c.checkRedirect,
	}
	return c
}

// control runs for every connection attempt, with the resolved IP address.
func (cfg config) control(network, address string, _ syscall.RawConn) error {
	if network != "tcp4" && network != "tcp6" {
		return fmt.Errorf("%w: network %q", ErrBlockedAddress, network)
	}
	host, portStr, err := net.SplitHostPort(address)
	if err != nil {
		return fmt.Errorf("%w: %q", ErrBlockedAddress, address)
	}
	ip, err := netip.ParseAddr(host)
	if err != nil {
		return fmt.Errorf("%w: %q", ErrBlockedAddress, address)
	}
	if isBlockedIP(ip, cfg.allowLoopback) {
		return fmt.Errorf("%w: %s", ErrBlockedAddress, ip)
	}
	if !cfg.anyPort {
		port, err := strconv.Atoi(portStr)
		if err != nil || (port != 80 && port != 443) {
			return fmt.Errorf("%w: %s", ErrBlockedPort, portStr)
		}
	}
	return nil
}

func (c *Client) checkRedirect(req *http.Request, via []*http.Request) error {
	if len(via) > c.maxRedirects {
		return ErrTooManyRedirects
	}
	return validateURL(req.URL)
}

// Get fetches rawURL with a GET request under the given limits.
func (c *Client) Get(ctx context.Context, rawURL string, lim Limits) (*Response, error) {
	if lim.MaxBytes <= 0 || len(lim.ContentTypes) == 0 {
		return nil, ErrInvalidLimits
	}
	u, err := url.Parse(rawURL)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidURL, err)
	}
	if err := validateURL(u); err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidURL, err)
	}
	req.Header.Set("User-Agent", c.userAgent)
	req.Header.Set("Accept", strings.Join(lim.ContentTypes, ", "))

	resp, err := c.hc.Do(req)
	if err != nil {
		return nil, fmt.Errorf("safehttp: get: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return nil, &StatusError{Code: resp.StatusCode}
	}
	ct := mediaType(resp.Header.Get("Content-Type"))
	if !contains(lim.ContentTypes, ct) {
		return nil, fmt.Errorf("%w: %q", ErrUnsupportedContentType, ct)
	}
	if resp.ContentLength > lim.MaxBytes {
		return nil, ErrTooLarge
	}
	// Read one byte past the cap to tell "exactly at the cap" from "over it".
	body, err := io.ReadAll(io.LimitReader(resp.Body, lim.MaxBytes+1))
	if err != nil {
		return nil, fmt.Errorf("safehttp: read body: %w", err)
	}
	if int64(len(body)) > lim.MaxBytes {
		return nil, ErrTooLarge
	}
	return &Response{FinalURL: resp.Request.URL, ContentType: ct, Body: body}, nil
}

func validateURL(u *url.URL) error {
	if u.Scheme != "http" && u.Scheme != "https" {
		return fmt.Errorf("%w: scheme %q", ErrInvalidURL, u.Scheme)
	}
	if u.Hostname() == "" {
		return fmt.Errorf("%w: missing host", ErrInvalidURL)
	}
	if u.User != nil {
		return fmt.Errorf("%w: credentials in url", ErrInvalidURL)
	}
	return nil
}

func mediaType(header string) string {
	mt, _, err := mime.ParseMediaType(header)
	if err != nil {
		return ""
	}
	return strings.ToLower(mt)
}

func contains(list []string, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}
