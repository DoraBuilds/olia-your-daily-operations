#!/bin/sh

set -eu

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <docker|prod>" >&2
  exit 1
fi

profile="$1"
source_file=".env.$profile"
target_file=".env.local"

if [ ! -f "$source_file" ]; then
  echo "Missing $source_file" >&2
  echo "Create $source_file with the correct values, then rerun the command." >&2
  exit 1
fi

cp "$source_file" "$target_file"
echo "Activated $source_file -> $target_file"
