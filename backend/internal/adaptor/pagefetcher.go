package adaptor

import (
	"context"
	"fmt"
	"strings"

	"marker/internal/domain"
	"marker/pkg/safehttp"
)

// PageFetcher downloads a page and its favicon through safehttp, the only HTTP client
// allowed for user-supplied URLs. It holds no business rules: truncation and what may
// be stored are the usecase's business.
type PageFetcher struct {
	client *safehttp.Client
}

func NewPageFetcher(client *safehttp.Client) *PageFetcher {
	return &PageFetcher{client: client}
}

// FetchPage fetches rawURL and extracts its title and text. A missing or unusable
// favicon is not an error: the result simply has no favicon.
func (f *PageFetcher) FetchPage(ctx context.Context, rawURL string) (domain.FetchedPage, error) {
	resp, err := f.client.Get(ctx, rawURL, safehttp.PageLimits)
	if err != nil {
		return domain.FetchedPage{}, err
	}
	extracted, err := ExtractPage(resp.Body, resp.FinalURL)
	if err != nil {
		return domain.FetchedPage{}, fmt.Errorf("extract page: %w", err)
	}
	page := domain.FetchedPage{Title: extracted.Title, Text: extracted.Text}

	icon, err := f.client.Get(ctx, extracted.FaviconURL, safehttp.FaviconLimits)
	if err != nil || len(icon.Body) == 0 || len(icon.Body) > domain.MaxFaviconBytes {
		return page, nil
	}
	page.Favicon = &domain.FaviconData{
		Host:        strings.ToLower(resp.FinalURL.Hostname()),
		ContentType: icon.ContentType,
		Data:        icon.Body,
	}
	return page, nil
}
