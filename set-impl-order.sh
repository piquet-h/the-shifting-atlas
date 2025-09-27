#!/usr/bin/env bash
# Portable (macOS Bash 3.2 compatible) version – removes associative arrays.
# Requires: gh CLI, jq, project_snapshot.json (fresh export containing issues + project items)
set -euo pipefail

# === CONFIG ===
PROJECT_ID="3"                               # Correct project number
FIELD_ID="PVTF_lAHOANLlqs4BEJKizg13FDI"      # Project field ID for "Implementation order"
VALUE_KIND="number"                          # "number" or "text"

# Ordered pairs: <issueNumber> <implementationOrder>
read -r -d '' ORDERS <<'EOF'
4 1
7 2
5 3
6 4
9 5
8 6
13 7
12 8
15 9
14 10
10 11
11 12
EOF

need() { command -v "$1" >/dev/null 2>&1 || { echo "Error: '$1' is required." >&2; exit 1; }; }
need gh
need jq

if [[ ! -f project_snapshot.json ]]; then
  cat >&2 <<EOM
Missing project_snapshot.json
Generate one first, e.g.:
  gh api graphql -f query='query($login:String!,$proj:Int!){\n  user(login:$login){\n    projectV2(number:$proj){ id items(first:200){ nodes{ id fieldValues(first:50){nodes{__typename}} content{... on Issue { id number title }}} } }\n  }\n  repository(owner:$login,name:"the-shifting-atlas"){ issues(first:200){ nodes{ id number title } } }\n}' -f login="$(gh api user -q .login)" -F proj=4 > project_snapshot.json
EOM
  exit 1
fi

lookup_issue_id() {
  local num=$1
  jq -r --arg n "$num" '.data.repository.issues.nodes[] | select(.number==($n|tonumber)) | .id' project_snapshot.json
}

lookup_item_id() {
  local num=$1
  jq -r --arg n "$num" '.data.user.projectV2.items.nodes[] | select(.content!=null and .content.number==($n|tonumber)) | .id' project_snapshot.json
}

add_item() {
  local issue_num=$1 issue_id=$2
  local existing
  existing=$(lookup_item_id "$issue_num") || true
  if [[ -n "$existing" ]]; then
    echo "Issue #$issue_num already in project as item $existing"
    echo "$existing"
    return 0
  fi
  local resp
  resp=$(gh api graphql -f query='mutation($project:ID!,$content:ID!){ addProjectV2ItemById(input:{projectId:$project,contentId:$content}){ item { id } }}' -F project="$PROJECT_ID" -F content="$issue_id")
  echo "$resp" | jq -r '.data.addProjectV2ItemById.item.id'
}

set_field() {
  local item_id=$1 order=$2
  if [[ "$VALUE_KIND" == "number" ]]; then
    gh api graphql -f query='mutation($p:ID!,$i:ID!,$f:ID!,$v:Float!){ updateProjectV2ItemFieldValue(input:{projectId:$p,itemId:$i,fieldId:$f,value:{number:$v}}){ projectV2Item { id } }}' -F p="$PROJECT_ID" -F i="$item_id" -F f="$FIELD_ID" -F v="$order" >/dev/null
  else
    gh api graphql -f query='mutation($p:ID!,$i:ID!,$f:ID!,$v:String!){ updateProjectV2ItemFieldValue(input:{projectId:$p,itemId:$i,fieldId:$f,value:{text:$v}}){ projectV2Item { id } }}' -F p="$PROJECT_ID" -F i="$item_id" -F f="$FIELD_ID" -F v="$order" >/dev/null
  fi
}

echo "Applying Implementation order field values..."
while read -r issue_num order; do
  [[ -z "$issue_num" || "$issue_num" == \#* ]] && continue
  issue_id=$(lookup_issue_id "$issue_num")
  if [[ -z "$issue_id" || "$issue_id" == "null" ]]; then
    echo "Skip issue #$issue_num (ID not found in snapshot)" >&2
    continue
  fi
  item_id=$(add_item "$issue_num" "$issue_id")
  if [[ -z "$item_id" || "$item_id" == "null" ]]; then
    echo "Failed to get/create project item for issue #$issue_num" >&2
    continue
  fi
  set_field "$item_id" "$order"
  echo "Issue #$issue_num -> order $order (item $item_id)"
done <<< "$ORDERS"

echo "Done. Tip: re-run the snapshot export if you need to audit results."
