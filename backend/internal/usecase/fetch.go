package usecase

import (
	"context"
	"errors"
	"log/slog"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"marker/internal/domain"
)

// fetchDeadline bounds the network part of a fetch. The job as a whole has 15 seconds
// (NFR-11); the rest is left for recording the result.
const fetchDeadline = 11 * time.Second

// PageFetcher downloads a page and extracts its text, title and favicon. A favicon
// that is missing, too large or unfetchable is reported as a nil Favicon, not an error.
type PageFetcher interface {
	FetchPage(ctx context.Context, url string) (domain.FetchedPage, error)
}

// FetchService runs the background page fetch for a bookmark. It implements
// worker.BookmarkFetcher.
type FetchService struct {
	store   FetchStore
	fetcher PageFetcher
}

func NewFetchService(store FetchStore, fetcher PageFetcher) *FetchService {
	return &FetchService{store: store, fetcher: fetcher}
}

// Fetch fetches the bookmark's page and records the outcome. It returns nil when the
// job is stale (bookmark gone, or no longer pending) and when the fetch itself fails,
// because a failed fetch is recorded as fetch_status failed and is not retried.
func (s *FetchService) Fetch(ctx context.Context, bookmarkID uuid.UUID) error {
	b, err := s.store.FindForFetch(ctx, bookmarkID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	if b.FetchStatus != domain.FetchPending {
		return nil
	}

	fetchCtx, cancel := context.WithTimeout(ctx, fetchDeadline)
	page, err := s.fetcher.FetchPage(fetchCtx, b.URL)
	cancel()
	if err != nil {
		slog.Info("page fetch failed", "bookmark_id", b.ID, "error", err)
		return discardIfGone(s.store.RecordFetchFailure(ctx, b))
	}

	result := domain.FetchResult{
		Title:   truncateRunes(page.Title, domain.MaxTitleLength),
		Text:    truncateBytes(page.Text, domain.MaxContentBytes),
		Favicon: page.Favicon,
	}
	return discardIfGone(s.store.RecordFetchSuccess(ctx, b, result))
}

// discardIfGone turns "the bookmark or its user was deleted meanwhile" into a quiet
// success (FR-5c).
func discardIfGone(err error) error {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil
	}
	return err
}

// truncateRunes cuts s to at most n characters.
func truncateRunes(s string, n int) string {
	if utf8.RuneCountInString(s) <= n {
		return s
	}
	return string([]rune(s)[:n])
}

// truncateBytes cuts s to at most n bytes without splitting a character.
func truncateBytes(s string, n int) string {
	if len(s) <= n {
		return s
	}
	for n > 0 && !utf8.RuneStart(s[n]) {
		n--
	}
	return s[:n]
}
