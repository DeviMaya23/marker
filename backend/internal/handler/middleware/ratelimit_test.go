package middleware

import (
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/require"
)

// fakeClock is a clock tests move by hand.
type fakeClock struct {
	mu sync.Mutex
	t  time.Time
}

func newFakeClock() *fakeClock { return &fakeClock{t: time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)} }

func (c *fakeClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.t
}

func (c *fakeClock) Advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.t = c.t.Add(d)
}

func refill(n int) time.Duration { return time.Minute / time.Duration(n) }

func TestLimiter_Boundary(t *testing.T) {
	for _, n := range []int{SavesPerMinute, LoginPerMinute, CeilingPerMinute} {
		l := NewLimiter(n, newFakeClock().Now)
		for i := 0; i < n; i++ {
			ok, _ := l.Allow("k")
			require.True(t, ok, "request %d of %d", i+1, n)
		}
		ok, wait := l.Allow("k")
		require.False(t, ok, "request %d is refused", n+1)
		require.Positive(t, wait)
	}
}

func TestLimiter_Refill(t *testing.T) {
	for _, n := range []int{SavesPerMinute, LoginPerMinute, CeilingPerMinute} {
		clock := newFakeClock()
		l := NewLimiter(n, clock.Now)
		for i := 0; i < n; i++ {
			l.Allow("k")
		}

		clock.Advance(refill(n) - time.Millisecond)
		ok, _ := l.Allow("k")
		require.False(t, ok, "n=%d: 1 ms early", n)

		clock.Advance(2 * time.Millisecond)
		ok, _ = l.Allow("k")
		require.True(t, ok, "n=%d: 1 ms late", n)
		ok, _ = l.Allow("k")
		require.False(t, ok, "n=%d: only one token came back", n)
	}
}

func TestLimiter_SeparateKeys(t *testing.T) {
	l := NewLimiter(LoginPerMinute, newFakeClock().Now)
	for i := 0; i < LoginPerMinute; i++ {
		l.Allow("a")
	}
	ok, _ := l.Allow("a")
	require.False(t, ok)
	ok, _ = l.Allow("b")
	require.True(t, ok)
}

func TestLimiter_RefusalSpendsNothing(t *testing.T) {
	clock := newFakeClock()
	l := NewLimiter(LoginPerMinute, clock.Now)
	for i := 0; i < LoginPerMinute; i++ {
		l.Allow("k")
	}
	for i := 0; i < 5; i++ {
		ok, _ := l.Allow("k")
		require.False(t, ok)
	}
	clock.Advance(refill(LoginPerMinute))
	ok, _ := l.Allow("k")
	require.True(t, ok)
	ok, _ = l.Allow("k")
	require.False(t, ok)
}

func TestRetryAfterSeconds(t *testing.T) {
	tests := []struct {
		delay time.Duration
		want  int
	}{
		{200 * time.Millisecond, 1},
		{time.Second, 1},
		{1500 * time.Millisecond, 2},
		{6 * time.Second, 6},
		{0, 1},
	}
	for _, tt := range tests {
		require.Equal(t, tt.want, (&RateLimitedError{Delay: tt.delay}).RetryAfterSeconds(), tt.delay.String())
	}

	l := NewLimiter(LoginPerMinute, newFakeClock().Now)
	for i := 0; i < LoginPerMinute; i++ {
		l.Allow("k")
	}
	_, wait := l.Allow("k")
	require.Equal(t, 6, (&RateLimitedError{Delay: wait}).RetryAfterSeconds())
}

func TestLimiter_Sweep(t *testing.T) {
	t.Run("an entry idle for over 10 minutes is dropped, one used 9 minutes ago is kept", func(t *testing.T) {
		clock := newFakeClock()
		l := NewLimiter(LoginPerMinute, clock.Now)
		l.Allow("old")
		clock.Advance(time.Minute)
		l.Allow("recent")
		clock.Advance(8*time.Minute + 30*time.Second) // old: 9.5 min idle, recent: 8.5
		l.Allow("trigger")
		require.Equal(t, 3, l.len())

		clock.Advance(time.Minute + time.Second) // old: 10.5 min idle, recent: 9.5
		l.Allow("trigger")
		require.Equal(t, 2, l.len(), "old is gone")
		_, kept := l.entries["recent"]
		require.True(t, kept)
	})

	t.Run("calls less than a minute apart run at most one sweep", func(t *testing.T) {
		clock := newFakeClock()
		l := NewLimiter(LoginPerMinute, clock.Now)
		l.Allow("old")
		clock.Advance(10*time.Minute - time.Second)
		l.Allow("other") // sweeps (over a minute since creation); old is 9:59 idle, kept
		require.Equal(t, 2, l.len())

		clock.Advance(2 * time.Second) // old is now over 10 minutes idle, but the last sweep was 2 s ago
		l.Allow("other")
		require.Equal(t, 2, l.len(), "no second sweep inside a minute")

		clock.Advance(time.Minute)
		l.Allow("other")
		require.Equal(t, 1, l.len())
	})
}

func TestLimiter_Concurrent(t *testing.T) {
	const extra = 50
	l := NewLimiter(CeilingPerMinute, newFakeClock().Now)
	var passed atomic.Int64
	var wg sync.WaitGroup
	for i := 0; i < CeilingPerMinute+extra; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if ok, _ := l.Allow("k"); ok {
				passed.Add(1)
			}
		}()
	}
	wg.Wait()
	require.EqualValues(t, CeilingPerMinute, passed.Load())
}

func TestUserLimit(t *testing.T) {
	run := func(l *Limiter, ctxUser *uuid.UUID) error {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		if ctxUser != nil {
			req = req.WithContext(WithAuth(req.Context(), Auth{UserID: *ctxUser}))
		}
		c := echo.New().NewContext(req, httptest.NewRecorder())
		return UserLimit(l)(func(echo.Context) error { return nil })(c)
	}

	t.Run("no authenticated user is an error and does not pass", func(t *testing.T) {
		l := NewLimiter(LoginPerMinute, newFakeClock().Now)
		err := run(l, nil)
		require.Error(t, err)
		var limited *RateLimitedError
		require.NotErrorAs(t, err, &limited)
		require.Zero(t, l.len())
	})

	t.Run("an empty bucket is a RateLimitedError", func(t *testing.T) {
		l := NewLimiter(1, newFakeClock().Now)
		u := uuid.New()
		require.NoError(t, run(l, &u))
		err := run(l, &u)
		var limited *RateLimitedError
		require.ErrorAs(t, err, &limited)
		require.Positive(t, limited.Delay)
	})
}
