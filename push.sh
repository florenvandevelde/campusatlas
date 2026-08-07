#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Check if the current directory is a git repository
if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
    echo "❌ Error: This is not a git repository."
    exit 1
fi

# Get the current branch name dynamically
BRANCH=$(git branch --show-current)

# Get the commit message from the first argument
COMMIT_MSG="$1"

# If no commit message was provided as an argument, prompt the user for one
if [ -z "$COMMIT_MSG" ]; then
    echo "📝 Enter your commit message:"
    read -r COMMIT_MSG
fi

# Fallback check if the user entered an empty message in the prompt
if [ -z "$COMMIT_MSG" ]; then
    echo "❌ Error: Commit message cannot be empty."
    exit 1
fi

# Execute the Git workflow
echo "➕ Staging all changes..."
git add .

echo "💾 Committing changes..."
git commit -m "$COMMIT_MSG"

echo "🚀 Pushing to origin/$BRANCH..."
git push origin "$BRANCH"

echo "✅ Successfully added, committed, and pushed!"

