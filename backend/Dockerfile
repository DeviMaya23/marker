# Backend image for Google Cloud Run: the server, the migration tool and the SQL
# migration files, in one image. Nothing here was built or run by the author.
#
# Build, from the repository root:
#   docker build --platform linux/amd64 -t marker-backend backend
#
# Run the server (settings come from the environment):
#   docker run --rm -p 8080:8080 --env-file <env file> marker-backend
#
# Run migrations, as a separate step before each release, against Neon's direct
# (non-pooled) connection string. No arguments are needed: the working directory
# is /app, where migration/ is:
#   docker run --rm --entrypoint /app/migrate -e DATABASE_URL=<direct connection url> marker-backend
#
# The image holds no secrets, and the server does not migrate at start.
#
# Settings can also come from a file named by ENV_FILE, read once at start. Real
# environment variables take precedence over the file. The file holds KEY=VALUE lines
# and godotenv's quoting rules apply (quotes are removed), not those of --env-file.
# A value that contains $, " #" or a backslash must be in single quotes.
#   Local:
#   docker run --rm -p 8080:8080 -v <env file>:/secrets/env:ro -e ENV_FILE=/secrets/env marker-backend
#   The mounted file must be readable by user 65532, for example mode 0644.
#   Cloud Run (the user's deployment step; not tested by the author):
#   --set-secrets=/secrets/env=<secret>:latest --set-env-vars=ENV_FILE=/secrets/env
# The caution below about HTTP_ADDR applies to --env-file only: a variable in the
# ENV_FILE file never overrides one the container already has, HTTP_ADDR included.
#
# Caution on the run command: the env file must not set HTTP_ADDR to anything but
# :8080 (it overrides the image's value, and the repository's .env.example sets
# :8085). Its DATABASE_URL must be reachable from inside the container (localhost
# there is the container itself). `docker --env-file` does not strip quotes the way
# `make` does, so write the values without quotes.

FROM golang:1.26 AS build
ENV GOTOOLCHAIN=local
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server \
 && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/migrate ./cmd/migrate

FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --from=build /out/server /out/migrate /app/
COPY --chown=65532:65532 migration /app/migration/
USER 65532:65532
ENV HTTP_ADDR=:8080
EXPOSE 8080
ENTRYPOINT ["/app/server"]
