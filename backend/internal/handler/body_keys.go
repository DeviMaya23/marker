package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"io"

	"github.com/labstack/echo/v4"

	"marker/internal/domain"
)

// The generated UpdateBookmarkRequest has plain pointers, so a key that is absent and a
// key that is null both decode to nil. A PATCH needs the difference: `"note": null`
// clears the note and a missing `note` leaves it alone.
//
// recordBodyKeys is an operation middleware. It reads the raw body once, records which
// top-level keys were present and which of them were null, puts that in the request
// context and hands the same bytes on, so the generated code still decodes the body as
// before. The values themselves come from that decode; this only adds presence.
//
// A body that is not a JSON object (an array, a string, malformed JSON) records
// nothing: the generated code rejects it with 400 before the handler runs. A body of
// `null` or an empty one records no keys, as the generated code treats them as `{}`.
// A key repeated in the body counts as its last occurrence, which is also what the
// decoder keeps.

type bodyKeysKey struct{}

// bodyKeys maps each top-level key of the body to whether its value was null.
type bodyKeys map[string]bool

func recordBodyKeys(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		req := c.Request()
		raw, err := io.ReadAll(req.Body)
		if err != nil {
			return err // for example the 64 KiB cap, which Echo answers as 413
		}
		req.Body = io.NopCloser(bytes.NewReader(raw))

		var members map[string]json.RawMessage
		if len(bytes.TrimSpace(raw)) == 0 {
			members = map[string]json.RawMessage{}
		} else if err := json.Unmarshal(raw, &members); err != nil {
			return next(c)
		}
		keys := make(bodyKeys, len(members))
		for k, v := range members {
			keys[k] = bytes.Equal(bytes.TrimSpace(v), []byte("null"))
		}
		c.SetRequest(req.WithContext(context.WithValue(req.Context(), bodyKeysKey{}, keys)))
		return next(c)
	}
}

func bodyKeysFrom(ctx context.Context) (bodyKeys, bool) {
	k, ok := ctx.Value(bodyKeysKey{}).(bodyKeys)
	return k, ok
}

// fieldOf is the three-state value of key: absent, null, or *v.
func fieldOf[T any](keys bodyKeys, key string, v *T) domain.Field[T] {
	isNull, present := keys[key]
	switch {
	case !present:
		return domain.Absent[T]()
	case isNull || v == nil:
		return domain.Null[T]()
	default:
		return domain.Value(*v)
	}
}
