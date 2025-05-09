#!/bin/bash

# Create a backup branch
git checkout -b backup-before-api-key-removal

# Remove the API key from git history
git filter-branch --force --index-filter \
"git rm --cached --ignore-unmatch frontend/.env" \
--prune-empty --tag-name-filter cat -- --all

# Force push the changes
git push origin --force --all

# Clean up
git for-each-ref --format='delete %(refname)' refs/original | git update-ref --stdin
git reflog expire --expire=now --all
git gc --prune=now 