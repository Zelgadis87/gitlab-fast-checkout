Simple tool to switch to a GitLab automatically created branch.

## Workflow:
1. Create an issue on GitLab
2. Create related merge request from issue page
3. In the local project, run `gfc <issue-number>`, where issue-number is the ID of the newly created issue. Eg: `gfc 123`
4. ✔: The local project is now pointing at the desired branch
