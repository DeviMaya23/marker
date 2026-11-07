package config

import (
	"errors"
	"fmt"
	"os"

	"github.com/joho/godotenv"
)

// LoadEnvFile fills unset variables from the KEY=VALUE file named by ENV_FILE, so a
// secret mounted as a file can supply the settings. It must run before Load. When
// ENV_FILE is empty it does nothing. A variable that is already set to a non-empty
// value in the real environment is kept; an empty one counts as unset, as in getenv.
//
// The file holds secrets and the caller prints errors with log.Fatalf, so no error
// returned here contains file content. In particular the parser's own error is
// discarded without being formatted or wrapped, because it echoes the offending
// line or the rest of the file. The whole file is parsed before anything is set.
// The function logs and prints nothing.
func LoadEnvFile() error {
	path := os.Getenv("ENV_FILE")
	if path == "" {
		return nil
	}

	data, err := os.ReadFile(path)
	if err != nil {
		// The standard library's error holds the path and the reason, never content.
		return fmt.Errorf("ENV_FILE: cannot read the file: %w", err)
	}

	values, err := godotenv.UnmarshalBytes(data)
	if err != nil {
		return errors.New("ENV_FILE: the file is not valid KEY=VALUE lines (the parser's message is not shown because it can contain secret values)")
	}

	for key, value := range values {
		if os.Getenv(key) != "" {
			continue
		}
		if err := os.Setenv(key, value); err != nil {
			return errors.New("ENV_FILE: cannot set a variable from the file")
		}
	}
	return nil
}
