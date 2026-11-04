package middleware

import (
	"errors"
	"math"
	"net/http"
	"sync"
	"time"

	"github.com/labstack/echo/v4"
	"golang.org/x/time/rate"
)

// The limits (NFR-16), in requests per minute. Exported so tests use the same numbers.
const (
	SavesPerMinute   = 30  // POST /bookmarks, per user
	LoginPerMinute   = 10  // GET /auth/login and /auth/callback, per client IP
	CeilingPerMinute = 300 // every other authenticated call, per user
)

const (
	sweepEvery = time.Minute      // how often a call may sweep idle entries
	idleAfter  = 10 * time.Minute // an entry unused this long has a full bucket again
)

// RateLimitedError is returned when a limiter refuses a request. It carries how long
// the caller should wait. The error handler renders it as 429 rate_limited with a
// Retry-After header.
type RateLimitedError struct {
	Delay time.Duration
}

func (e *RateLimitedError) Error() string { return "rate limited" }

// RetryAfterSeconds is the wait in whole seconds, rounded up and never less than 1: a
// client told 0 would retry at once and be refused again.
func (e *RateLimitedError) RetryAfterSeconds() int {
	return max(1, int(math.Ceil(e.Delay.Seconds())))
}

type entry struct {
	limiter *rate.Limiter
	lastUse time.Time
}

// Limiter is a set of token buckets, one per key, all with the same rule: n requests a
// minute, the bucket starting full. It is safe for concurrent use.
type Limiter struct {
	perMinute int
	now       func() time.Time

	mu        sync.Mutex
	entries   map[string]*entry
	lastSweep time.Time
}

// NewLimiter returns a limiter allowing perMinute requests a minute per key. A nil now
// means the real clock.
func NewLimiter(perMinute int, now func() time.Time) *Limiter {
	if now == nil {
		now = time.Now
	}
	return &Limiter{
		perMinute: perMinute,
		now:       now,
		entries:   make(map[string]*entry),
		lastSweep: now(),
	}
}

// Allow takes one token from key's bucket. It reports whether the request may pass; if
// not, wait is how long until a token is back, and nothing was spent.
func (l *Limiter) Allow(key string) (ok bool, wait time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := l.now()
	l.sweep(now)

	e := l.entries[key]
	if e == nil {
		e = &entry{limiter: rate.NewLimiter(rate.Limit(float64(l.perMinute)/60), l.perMinute)}
		l.entries[key] = e
	}
	e.lastUse = now

	r := e.limiter.ReserveN(now, 1)
	if delay := r.DelayFrom(now); delay > 0 {
		r.CancelAt(now)
		return false, delay
	}
	return true, 0
}

// sweep drops entries unused for more than idleAfter, at most once a minute. The caller
// holds the lock.
func (l *Limiter) sweep(now time.Time) {
	if now.Sub(l.lastSweep) <= sweepEvery {
		return
	}
	l.lastSweep = now
	for k, e := range l.entries {
		if now.Sub(e.lastUse) > idleAfter {
			delete(l.entries, k)
		}
	}
}

// len reports the number of keys held, for the sweep test.
func (l *Limiter) len() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.entries)
}

// RateLimits is the set of limiters the router uses.
type RateLimits struct {
	saves    *Limiter
	login    *Limiter
	ceiling  *Limiter
	clientIP func(*http.Request) string
}

// NewRateLimits builds the three limiters. clientIPHeader is the CLIENT_IP_HEADER
// setting (see ClientIP). A nil now means the real clock.
func NewRateLimits(clientIPHeader string, now func() time.Time) *RateLimits {
	return &RateLimits{
		saves:    NewLimiter(SavesPerMinute, now),
		login:    NewLimiter(LoginPerMinute, now),
		ceiling:  NewLimiter(CeilingPerMinute, now),
		clientIP: ClientIP(clientIPHeader),
	}
}

// Ceiling limits every authenticated call per user. Place it after Session.
func (r *RateLimits) Ceiling() echo.MiddlewareFunc { return UserLimit(r.ceiling) }

// Saves limits bookmark creation per user. Place it after Session.
func (r *RateLimits) Saves() echo.MiddlewareFunc { return UserLimit(r.saves) }

// Login limits the public login routes per client IP.
func (r *RateLimits) Login() echo.MiddlewareFunc { return IPLimit(r.login, r.clientIP) }

// UserLimit refuses a request when the authenticated user's bucket is empty. It needs
// the Session middleware in front; without an authenticated user it fails with a plain
// error (500) rather than skipping the limit.
func UserLimit(l *Limiter) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			auth, ok := AuthFrom(c.Request().Context())
			if !ok {
				return errors.New("rate limit: no authenticated user in the request context")
			}
			if ok, wait := l.Allow(auth.UserID.String()); !ok {
				return &RateLimitedError{Delay: wait}
			}
			return next(c)
		}
	}
}

// IPLimit refuses a request when the bucket of the caller's address is empty.
func IPLimit(l *Limiter, clientIP func(*http.Request) string) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			if ok, wait := l.Allow(clientIP(c.Request())); !ok {
				return &RateLimitedError{Delay: wait}
			}
			return next(c)
		}
	}
}
