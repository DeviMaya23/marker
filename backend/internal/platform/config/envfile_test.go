package config

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
)

const (
	parseMessage  = "ENV_FILE: the file is not valid KEY=VALUE lines (the parser's message is not shown because it can contain secret values)"
	setenvMessage = "ENV_FILE: cannot set a variable from the file"
)

// writeEnvFile writes content to a temp file and points ENV_FILE at it.
func writeEnvFile(t *testing.T, content string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "env")
	require.NoError(t, os.WriteFile(path, []byte(content), 0o600))
	t.Setenv("ENV_FILE", path)
	return path
}

// unsetAfter makes sure a variable the loader may set does not leak into other tests.
func unsetAfter(t *testing.T, names ...string) {
	t.Helper()
	for _, name := range names {
		os.Unsetenv(name)
		t.Cleanup(func() { os.Unsetenv(name) })
	}
}

func requireUnset(t *testing.T, names ...string) {
	t.Helper()
	for _, name := range names {
		_, ok := os.LookupEnv(name)
		require.False(t, ok, "%s must not be set", name)
	}
}

func TestLoadEnvFile(t *testing.T) {
	t.Run("unset does nothing and does not read .env", func(t *testing.T) {
		dir := t.TempDir()
		require.NoError(t, os.WriteFile(filepath.Join(dir, ".env"), []byte("ENVFILE_TEST_DOTENV=x\n"), 0o600))
		t.Chdir(dir)
		unsetAfter(t, "ENVFILE_TEST_DOTENV", "ENV_FILE")
		require.NoError(t, LoadEnvFile())
		requireUnset(t, "ENVFILE_TEST_DOTENV")
	})

	t.Run("empty does nothing and does not read .env", func(t *testing.T) {
		dir := t.TempDir()
		require.NoError(t, os.WriteFile(filepath.Join(dir, ".env"), []byte("ENVFILE_TEST_DOTENV=x\n"), 0o600))
		t.Chdir(dir)
		unsetAfter(t, "ENVFILE_TEST_DOTENV")
		t.Setenv("ENV_FILE", "")
		require.NoError(t, LoadEnvFile())
		requireUnset(t, "ENVFILE_TEST_DOTENV")
	})

	t.Run("an ENV_FILE key in the file is not followed", func(t *testing.T) {
		path := writeEnvFile(t, "ENV_FILE=/nonexistent/other\n")
		require.NoError(t, LoadEnvFile())
		require.Equal(t, path, os.Getenv("ENV_FILE"))
	})

	t.Run("parses the documented forms", func(t *testing.T) {
		unsetAfter(t, "ENVFILE_TEST_A", "ENVFILE_TEST_B", "ENVFILE_TEST_C", "ENVFILE_TEST_D")
		writeEnvFile(t, "# a comment\n\nENVFILE_TEST_A=plain\nexport ENVFILE_TEST_B=exported\nENVFILE_TEST_C=\"double quoted\"\nENVFILE_TEST_D='single quoted'\n")
		require.NoError(t, LoadEnvFile())
		require.Equal(t, "plain", os.Getenv("ENVFILE_TEST_A"))
		require.Equal(t, "exported", os.Getenv("ENVFILE_TEST_B"))
		require.Equal(t, "double quoted", os.Getenv("ENVFILE_TEST_C"))
		require.Equal(t, "single quoted", os.Getenv("ENVFILE_TEST_D"))
	})

	t.Run("the real environment wins, empty counts as unset", func(t *testing.T) {
		unsetAfter(t, "ENVFILE_TEST_UNSET")
		t.Setenv("ENVFILE_TEST_REAL", "real")
		t.Setenv("ENVFILE_TEST_EMPTY", "")
		writeEnvFile(t, "ENVFILE_TEST_REAL=file\nENVFILE_TEST_UNSET=file\nENVFILE_TEST_EMPTY=file\n")
		require.NoError(t, LoadEnvFile())
		require.Equal(t, "real", os.Getenv("ENVFILE_TEST_REAL"))
		require.Equal(t, "file", os.Getenv("ENVFILE_TEST_UNSET"))
		require.Equal(t, "file", os.Getenv("ENVFILE_TEST_EMPTY"))
	})

	t.Run("single quotes keep the value byte for byte", func(t *testing.T) {
		unsetAfter(t, "ENVFILE_TEST_S1", "ENVFILE_TEST_S2", "ENVFILE_TEST_S3")
		writeEnvFile(t, "ENVFILE_TEST_S1='$ENVFILE_TEST_X'\nENVFILE_TEST_S2='x # not a comment'\nENVFILE_TEST_S3='pa$word'\n")
		require.NoError(t, LoadEnvFile())
		require.Equal(t, "$ENVFILE_TEST_X", os.Getenv("ENVFILE_TEST_S1"))
		require.Equal(t, "x # not a comment", os.Getenv("ENVFILE_TEST_S2"))
		require.Equal(t, "pa$word", os.Getenv("ENVFILE_TEST_S3"))
	})

	t.Run("an unquoted value ends before a space and hash", func(t *testing.T) {
		unsetAfter(t, "ENVFILE_TEST_U")
		writeEnvFile(t, "ENVFILE_TEST_U=value # comment\n")
		require.NoError(t, LoadEnvFile())
		require.Equal(t, "value", os.Getenv("ENVFILE_TEST_U"))
	})

	t.Run("a missing file or a directory is an error naming the path", func(t *testing.T) {
		unsetAfter(t, "ENVFILE_TEST_A")
		missing := filepath.Join(t.TempDir(), "missing")
		for _, path := range []string{missing, t.TempDir()} {
			t.Setenv("ENV_FILE", path)
			err := LoadEnvFile()
			require.Error(t, err)
			require.Contains(t, err.Error(), "ENV_FILE: cannot read the file:")
			require.Contains(t, err.Error(), path)
		}
		requireUnset(t, "ENVFILE_TEST_A")
	})

	secrets := []string{"top-secret-aaa", "top-secret-bbb", "top-secret-ccc", "top-secret-ddd", "top-secret-eee", "top-secret-fff"}

	parseFailures := map[string]string{
		"a bad key name":          "ENVFILE_TEST_A=top-secret-aaa\nbad-key!=top-secret-bbb\nENVFILE_TEST_B=top-secret-fff\n",
		"an unterminated quote":   "ENVFILE_TEST_A=top-secret-aaa\nENVFILE_TEST_B=\"top-secret-ccc\n",
		"a bare word with hyphen": "ENVFILE_TEST_A=top-secret-aaa\ntop-secret-eee\nENVFILE_TEST_B=top-secret-fff\n",
	}
	for name, content := range parseFailures {
		t.Run("a parse error shows only the fixed message: "+name, func(t *testing.T) {
			unsetAfter(t, "ENVFILE_TEST_A", "ENVFILE_TEST_B")
			writeEnvFile(t, content)
			err := LoadEnvFile()
			require.EqualError(t, err, parseMessage)
			for _, s := range secrets {
				require.NotContains(t, err.Error(), s)
			}
			requireUnset(t, "ENVFILE_TEST_A", "ENVFILE_TEST_B")
		})
	}

	setenvFailures := map[string]string{
		"an empty name":              "ENVFILE_TEST_A=top-secret-aaa\n=top-secret-ddd\n",
		"a bare word without hyphen": "ENVFILE_TEST_A=top-secret-aaa\ntopsecreteee",
	}
	for name, content := range setenvFailures {
		t.Run("a setenv failure shows only the fixed message: "+name, func(t *testing.T) {
			unsetAfter(t, "ENVFILE_TEST_A")
			writeEnvFile(t, content)
			err := LoadEnvFile()
			require.EqualError(t, err, setenvMessage)
			for _, s := range secrets {
				require.NotContains(t, err.Error(), s)
			}
		})
	}
}
