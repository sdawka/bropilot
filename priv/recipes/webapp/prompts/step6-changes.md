# Step 6: Change Plan

You are analyzing the diff between the current specs and the last version snapshot.
Generate a structured change plan.

For each change, identify:
- **what**: Which spec entry changed
- **type**: added | modified | removed
- **impact**: Which other specs are affected (follow cross-references)
- **requirements**: What needs to be true for this change to be implemented
- **dependencies**: Which other changes must happen first

Output as changes.yaml in the current version directory.
