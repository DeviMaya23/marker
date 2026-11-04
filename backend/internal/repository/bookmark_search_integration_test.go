//go:build integration

package repository_test

import (
	"bytes"
	"context"
	"fmt"
	"log"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"marker/internal/domain"
	"marker/internal/repository"
	"marker/internal/testutil"
)

// doc is one bookmark to seed for a search test.
type doc struct {
	Title, URL, Note, Content string
	Folder                    *uuid.UUID
	At                        time.Time // created_at; zero keeps the default
	Trashed                   bool
}

// seedDoc stores a bookmark the way the app does: Create builds the search vector from
// title and URL, a successful fetch stores the content and rebuilds the vector. The note
// is written to its column only, as an edit does not change search_vector either.
func seedDoc(t *testing.T, db *gorm.DB, repo *repository.BookmarkRepository, userID uuid.UUID, d doc) domain.Bookmark {
	t.Helper()
	ctx := context.Background()
	if d.URL == "" {
		d.URL = "https://example.com/" + domain.NewID().String()
	}
	b := newBookmark(userID, d.URL)
	b.Title, b.FolderID = d.Title, d.Folder
	require.NoError(t, repo.Create(ctx, b))
	if d.Content != "" {
		require.NoError(t, repo.RecordFetchSuccess(ctx, b, domain.FetchResult{Text: d.Content}))
	}
	cols := map[string]any{"note": d.Note}
	if !d.At.IsZero() {
		cols["created_at"] = d.At
	}
	if d.Trashed {
		cols["deleted_at"] = time.Now()
	}
	require.NoError(t, db.Model(&domain.Bookmark{}).Where("id = ?", b.ID).UpdateColumns(cols).Error)
	return b
}

// searchOf runs one search page.
func searchOf(t *testing.T, repo *repository.BookmarkRepository, userID uuid.UUID, q string, notes bool, folder *uuid.UUID, offset, limit int) []domain.Bookmark {
	t.Helper()
	rows, err := repo.Search(context.Background(), domain.BookmarkSearchQuery{
		UserID: userID, Query: q, IncludeNotes: notes, FolderID: folder, Offset: offset, Limit: limit,
	})
	require.NoError(t, err)
	return rows
}

// searchIDs is the ids of all results of a search, best first.
func searchIDs(t *testing.T, repo *repository.BookmarkRepository, userID uuid.UUID, q string, notes bool) []uuid.UUID {
	t.Helper()
	return ids(searchOf(t, repo, userID, q, notes, nil, 0, 1000))
}

func TestBookmarkRepository_Search_FieldsMatched(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewBookmarkRepository(db)
	user := newUser(t, db)

	title := seedDoc(t, db, repo, user.ID, doc{Title: "Quokka habitat"})
	byURL := seedDoc(t, db, repo, user.ID, doc{URL: "https://wombat.example.org/page"})
	content := seedDoc(t, db, repo, user.ID, doc{Title: "Unrelated", Content: "A long text that mentions the numbat somewhere."})
	note := seedDoc(t, db, repo, user.ID, doc{Title: "Unrelated too", Note: "remember the platypus"})

	require.Equal(t, []uuid.UUID{title.ID}, searchIDs(t, repo, user.ID, "quokka", false), "title")
	require.Equal(t, []uuid.UUID{byURL.ID}, searchIDs(t, repo, user.ID, "wombat.example.org", false), "url")
	require.Equal(t, []uuid.UUID{content.ID}, searchIDs(t, repo, user.ID, "numbat", false), "stored page content")

	require.Empty(t, searchIDs(t, repo, user.ID, "platypus", false), "a note is not searched by default")
	require.Equal(t, []uuid.UUID{note.ID}, searchIDs(t, repo, user.ID, "platypus", true), "a note-only match is found with notes")
	require.Equal(t, []uuid.UUID{title.ID}, searchIDs(t, repo, user.ID, "quokka", true), "the other fields still match with notes")

	var nrows int64
	require.NoError(t, db.Raw(`SELECT count(*) FROM bookmarks WHERE id = ? AND search_vector @@ plainto_tsquery('english', 'platypus')`, note.ID).Scan(&nrows).Error)
	require.Zero(t, nrows, "the note is never copied into search_vector")
}

func TestBookmarkRepository_Search_Ranking(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewBookmarkRepository(db)
	user := newUser(t, db)

	t.Run("a title match ranks above a content-only match", func(t *testing.T) {
		// The content match is the newer row, so only the rank can put the title first.
		inTitle := seedDoc(t, db, repo, user.ID, doc{Title: "Axolotl care", At: listTestBase})
		inContent := seedDoc(t, db, repo, user.ID, doc{Title: "Pets", Content: "All about the axolotl and more.", At: listTestBase.Add(time.Hour)})
		require.Equal(t, []uuid.UUID{inTitle.ID, inContent.ID}, searchIDs(t, repo, user.ID, "axolotl", false))
	})

	t.Run("a title match ranks above a note-only match with notes included", func(t *testing.T) {
		inTitle := seedDoc(t, db, repo, user.ID, doc{Title: "Capybara", At: listTestBase})
		inNote := seedDoc(t, db, repo, user.ID, doc{Title: "Rodents", Note: "capybara", At: listTestBase.Add(time.Hour)})
		require.Equal(t, []uuid.UUID{inTitle.ID, inNote.ID}, searchIDs(t, repo, user.ID, "capybara", true))
	})

	t.Run("ties are ordered by newest created_at, then id descending", func(t *testing.T) {
		old := seedDoc(t, db, repo, user.ID, doc{Title: "Pangolin", At: listTestBase})
		mid1 := seedDoc(t, db, repo, user.ID, doc{Title: "Pangolin", At: listTestBase.Add(time.Hour)})
		mid2 := seedDoc(t, db, repo, user.ID, doc{Title: "Pangolin", At: listTestBase.Add(time.Hour)})
		newest := seedDoc(t, db, repo, user.ID, doc{Title: "Pangolin", At: listTestBase.Add(2 * time.Hour)})

		hi, lo := mid1, mid2
		if lo.ID.String() > hi.ID.String() {
			hi, lo = lo, hi
		}
		want := []uuid.UUID{newest.ID, hi.ID, lo.ID, old.ID}
		require.Equal(t, want, searchIDs(t, repo, user.ID, "pangolin", false))
		require.Equal(t, want, searchIDs(t, repo, user.ID, "pangolin", true), "the same with notes")
	})

	t.Run("created_at decides before id when the newer row was inserted first", func(t *testing.T) {
		// IDs are time-ordered, so rows seeded oldest first would pass on id alone.
		// Seeding the newest row first makes its id the lowest: only created_at puts it first.
		newest := seedDoc(t, db, repo, user.ID, doc{Title: "Quokka", At: listTestBase.Add(2 * time.Hour)})
		mid := seedDoc(t, db, repo, user.ID, doc{Title: "Quokka", At: listTestBase.Add(time.Hour)})
		old := seedDoc(t, db, repo, user.ID, doc{Title: "Quokka", At: listTestBase})
		want := []uuid.UUID{newest.ID, mid.ID, old.ID}
		require.Equal(t, want, searchIDs(t, repo, user.ID, "quokka", false))
		require.Equal(t, want, searchIDs(t, repo, user.ID, "quokka", true), "the same with notes")
	})
}

func TestBookmarkRepository_Search_QuerySyntax(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewBookmarkRepository(db)
	user := newUser(t, db)

	both := seedDoc(t, db, repo, user.ID, doc{Title: "Red fox jumps"})
	onlyRed := seedDoc(t, db, repo, user.ID, doc{Title: "Red hat fox", Note: "x"})
	hasBlue := seedDoc(t, db, repo, user.ID, doc{Title: "Blue fox jumps"})

	tests := []struct {
		name string
		q    string
		want []uuid.UUID
	}{
		{"words are ANDed", "red fox", []uuid.UUID{both.ID, onlyRed.ID}},
		{"a quoted phrase matches only the phrase", `"red fox"`, []uuid.UUID{both.ID}},
		{"a minus excludes a word", "fox -red", []uuid.UUID{hasBlue.ID}},
		{"or is OR", "red or blue", nil}, // order checked separately below
		{"stop words only", "the", nil},
		{"stop words only, several", "the and of", nil},
		{"a partial word does not match", "jum", nil},
	}
	for _, tt := range tests {
		for _, notes := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s (notes=%v)", tt.name, notes), func(t *testing.T) {
				got := searchIDs(t, repo, user.ID, tt.q, notes)
				if tt.name == "or is OR" {
					require.ElementsMatch(t, []uuid.UUID{both.ID, onlyRed.ID, hasBlue.ID}, got)
					return
				}
				require.Equal(t, ids2(tt.want), ids2(got))
			})
		}
	}

	for _, q := range []string{`"`, "(", ")", "&", "'", ":*", "a:*", "-", "or", "!", "|", `\`, "'; DROP TABLE bookmarks;--", "😀", `"red`, "red &", "(red", "fox:*"} {
		for _, notes := range []bool{false, true} {
			t.Run(fmt.Sprintf("odd text %q (notes=%v) returns without error", q, notes), func(t *testing.T) {
				_, err := repo.Search(context.Background(), domain.BookmarkSearchQuery{UserID: user.ID, Query: q, IncludeNotes: notes, Limit: 51})
				require.NoError(t, err)
			})
		}
	}
	var n int64
	require.NoError(t, db.Raw(`SELECT count(*) FROM bookmarks WHERE user_id = ?`, user.ID).Scan(&n).Error)
	require.EqualValues(t, 3, n, "the table is still there")
}

// ids2 makes nil and empty compare equal.
func ids2(in []uuid.UUID) []uuid.UUID {
	if len(in) == 0 {
		return []uuid.UUID{}
	}
	return in
}

func TestBookmarkRepository_Search_Stemming(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewBookmarkRepository(db)
	user := newUser(t, db)
	b := seedDoc(t, db, repo, user.ID, doc{Title: "How to run"})
	require.Equal(t, []uuid.UUID{b.ID}, searchIDs(t, repo, user.ID, "running", false))
	require.Equal(t, []uuid.UUID{b.ID}, searchIDs(t, repo, user.ID, "running", true))
}

func TestBookmarkRepository_Search_FolderScope(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewBookmarkRepository(db)
	folders := repository.NewFolderRepository(db)
	user := newUser(t, db)

	root := mkFolder(t, folders, user.ID, nil, "root")
	child := mkFolder(t, folders, user.ID, &root, "child")
	grand := mkFolder(t, folders, user.ID, &child, "grandchild")
	sibling := mkFolder(t, folders, user.ID, nil, "sibling")

	inRoot := seedDoc(t, db, repo, user.ID, doc{Title: "Okapi", Folder: &root.ID})
	inChild := seedDoc(t, db, repo, user.ID, doc{Title: "Okapi", Folder: &child.ID})
	inGrand := seedDoc(t, db, repo, user.ID, doc{Title: "Okapi", Folder: &grand.ID})
	seedDoc(t, db, repo, user.ID, doc{Title: "Okapi", Folder: &sibling.ID})
	seedDoc(t, db, repo, user.ID, doc{Title: "Okapi"})

	for _, notes := range []bool{false, true} {
		got := ids(searchOf(t, repo, user.ID, "okapi", notes, &root.ID, 0, 100))
		require.ElementsMatch(t, []uuid.UUID{inRoot.ID, inChild.ID, inGrand.ID}, got, "notes=%v", notes)
	}
	require.ElementsMatch(t, []uuid.UUID{inChild.ID, inGrand.ID}, ids(searchOf(t, repo, user.ID, "okapi", false, &child.ID, 0, 100)))
	require.Equal(t, []uuid.UUID{inGrand.ID}, ids(searchOf(t, repo, user.ID, "okapi", false, &grand.ID, 0, 100)))
	require.Len(t, searchOf(t, repo, user.ID, "okapi", false, nil, 0, 100), 5, "no folder means everything")
}

func TestBookmarkRepository_Search_TrashedAndPending(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewBookmarkRepository(db)
	user := newUser(t, db)
	ctx := context.Background()

	live := seedDoc(t, db, repo, user.ID, doc{Title: "Tapir"})
	trashed := seedDoc(t, db, repo, user.ID, doc{Title: "Tapir", Note: "tapir"})
	require.NoError(t, repo.Trash(ctx, user.ID, trashed.ID))

	for _, notes := range []bool{false, true} {
		require.Equal(t, []uuid.UUID{live.ID}, searchIDs(t, repo, user.ID, "tapir", notes), "a trashed bookmark is not found (notes=%v)", notes)
	}

	_, err := repo.Restore(ctx, user.ID, trashed.ID)
	require.NoError(t, err)
	require.ElementsMatch(t, []uuid.UUID{live.ID, trashed.ID}, searchIDs(t, repo, user.ID, "tapir", false), "a restored bookmark is found again")

	pending := seedDoc(t, db, repo, user.ID, doc{Title: "Dugong", URL: "https://dugong-fan.example.net/x"})
	var status string
	require.NoError(t, db.Raw(`SELECT fetch_status FROM bookmarks WHERE id = ?`, pending.ID).Scan(&status).Error)
	require.Equal(t, string(domain.FetchPending), status)
	require.Equal(t, []uuid.UUID{pending.ID}, searchIDs(t, repo, user.ID, "dugong", false), "pending: by title")
	require.Equal(t, []uuid.UUID{pending.ID}, searchIDs(t, repo, user.ID, "dugong-fan.example.net", false), "pending: by URL")
}

func TestBookmarkRepository_Search_UserIsolation(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewBookmarkRepository(db)
	folders := repository.NewFolderRepository(db)
	alice, bob := newUser(t, db), newUser(t, db)
	aliceFolder := mkFolder(t, folders, alice.ID, nil, "a")
	bobFolder := mkFolder(t, folders, bob.ID, nil, "b")

	var aliceIDs, bobIDs []uuid.UUID
	for i := 0; i < 7; i++ {
		at := listTestBase.Add(time.Duration(i) * time.Minute)
		a := seedDoc(t, db, repo, alice.ID, doc{Title: "Lynx", Note: "lynx", At: at, Folder: &aliceFolder.ID})
		b := seedDoc(t, db, repo, bob.ID, doc{Title: "Lynx", Note: "lynx", At: at, Folder: &bobFolder.ID})
		aliceIDs, bobIDs = append(aliceIDs, a.ID), append(bobIDs, b.ID)
	}

	for _, notes := range []bool{false, true} {
		for _, tc := range []struct {
			user   uuid.UUID
			folder *uuid.UUID
			want   []uuid.UUID
		}{
			{alice.ID, nil, aliceIDs}, {bob.ID, nil, bobIDs},
			{alice.ID, &aliceFolder.ID, aliceIDs}, {bob.ID, &bobFolder.ID, bobIDs},
		} {
			// Three pages of 3, 3 and 1 rows, across a page boundary.
			var got []uuid.UUID
			for off := 0; off < 7; off += 3 {
				got = append(got, ids(searchOf(t, repo, tc.user, "lynx", notes, tc.folder, off, 3))...)
			}
			require.ElementsMatch(t, tc.want, got)
		}
		require.Empty(t, searchOf(t, repo, alice.ID, "lynx", notes, &bobFolder.ID, 0, 10), "another user's folder holds none of alice's rows")
		require.Empty(t, searchOf(t, repo, bob.ID, "lynx", notes, &aliceFolder.ID, 0, 10))
	}
}

func TestBookmarkRepository_Search_Paging(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewBookmarkRepository(db)
	user := newUser(t, db)
	var want []uuid.UUID // newest first, which is the rank order of equal matches
	for i := 0; i < 120; i++ {
		b := seedDoc(t, db, repo, user.ID, doc{Title: "Marmot", At: listTestBase.Add(time.Duration(i) * time.Second)})
		want = append([]uuid.UUID{b.ID}, want...)
	}

	// pages reads the way the usecase does: limit+1 rows from the offset.
	pages := func(limit int) [][]uuid.UUID {
		var out [][]uuid.UUID
		for off := 0; len(out) < 1000; off += limit {
			rows := searchOf(t, repo, user.ID, "marmot", false, nil, off, limit+1)
			if len(rows) <= limit {
				return append(out, ids(rows))
			}
			out = append(out, ids(rows[:limit]))
		}
		require.Fail(t, "paging did not end")
		return nil
	}

	got := pages(50)
	require.Equal(t, []int{50, 50, 20}, []int{len(got[0]), len(got[1]), len(got[2])})
	require.Equal(t, want, append(append(append([]uuid.UUID{}, got[0]...), got[1]...), got[2]...), "every row once, in rank order")

	// A page boundary at exactly the end: the extra row does not exist, so no empty page.
	for _, limit := range []int{40, 60, 120} {
		got = pages(limit)
		require.Len(t, got, 120/limit, "limit %d", limit)
		for _, p := range got {
			require.Len(t, p, limit)
		}
	}

	require.Equal(t, searchIDs(t, repo, user.ID, "marmot", false), searchIDs(t, repo, user.ID, "marmot", false), "the same data gives the same order")
	require.Empty(t, searchOf(t, repo, user.ID, "marmot", false, nil, 100000, 51), "an offset far past the end is an empty page")
}

func TestBookmarkRepository_Search_Speed(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewBookmarkRepository(db)
	user := newUser(t, db)

	// About 1,000 live bookmarks, each with several kilobytes of page content.
	require.NoError(t, db.Exec(`
INSERT INTO bookmarks (id, user_id, url, normalized_url, title, note, fetch_status, created_at, updated_at)
SELECT gen_random_uuid(), ?::uuid, 'https://example.com/' || g, 'https://example.com/' || g,
       'Bookmark number ' || g, 'note about item ' || g, 'ok',
       now() - (g || ' seconds')::interval, now()
FROM generate_series(1, 1000) g`, user.ID).Error)
	words := strings.Repeat("lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor ", 70)
	require.NoError(t, db.Exec(`
INSERT INTO bookmark_content (bookmark_id, text)
SELECT id, ? || ' unique' || substr(title, 17) || ' keyword' FROM bookmarks WHERE user_id = ?`, words, user.ID).Error)
	require.NoError(t, db.Exec(`
UPDATE bookmarks b SET search_vector =
    setweight(to_tsvector('english', b.title), 'A') ||
    setweight(to_tsvector('english', b.url), 'B') ||
    setweight(to_tsvector('english', (SELECT c.text FROM bookmark_content c WHERE c.bookmark_id = b.id)), 'C')
WHERE b.user_id = ?`, user.ID).Error)
	require.NoError(t, db.Exec(`ANALYZE bookmarks`).Error)

	for _, q := range []string{"keyword", "lorem item", `"dolor sit" -zzz`} {
		start := time.Now()
		rows := searchOf(t, repo, user.ID, q, true, nil, 0, 51)
		took := time.Since(start)
		t.Logf("search %q with notes over 1000 bookmarks: %d rows in %s", q, len(rows), took)
		require.NotEmpty(t, rows)
		require.Less(t, took, time.Second)
	}
}

func TestBookmarkRepository_Search_QueryShape(t *testing.T) {
	db := testutil.NewDB(t)
	user := newUser(t, db)
	seedDoc(t, db, repository.NewBookmarkRepository(db), user.ID, doc{Title: "Gecko", Content: "gecko text"})

	var sql bytes.Buffer
	capture := logger.New(log.New(&sql, "", 0), logger.Config{LogLevel: logger.Info, Colorful: false})
	repo := repository.NewBookmarkRepository(db.Session(&gorm.Session{Logger: capture}))

	for _, notes := range []bool{false, true} {
		sql.Reset()
		rows := searchOf(t, repo, user.ID, "gecko", notes, nil, 0, 51)
		require.Len(t, rows, 1)
		s := sql.String()
		require.NotContains(t, s, "bookmark_content", "the content is in search_vector already")
		require.Contains(t, s, "user_id =", "every query filters by user_id")
		require.Contains(t, s, "deleted_at IS NULL")
		require.Contains(t, s, "websearch_to_tsquery('english'")
		require.NotContains(t, s, "plainto_tsquery")
		require.NotContains(t, s, "ILIKE")
		require.Contains(t, s, "ts_rank(")
		require.Contains(t, s, "DESC, created_at DESC, id DESC")
		require.Equal(t, notes, strings.Contains(s, "setweight(to_tsvector('english', COALESCE(note, '')), 'D')"))
	}
}
