pub mod types;

use git2::{Commit, Delta, Diff, DiffOptions, Repository};
use std::cell::RefCell;
use thiserror::Error;

pub use types::*;

const MAX_PATCH_SIZE: usize = 50000; // 50KB max per file for display

#[derive(Error, Debug)]
pub enum GitError {
    #[error("Git error: {0}")]
    Git(#[from] git2::Error),
    #[error("Repository not found at {0}")]
    RepoNotFound(String),
    #[error("Commit not found: {0}")]
    CommitNotFound(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

pub type Result<T> = std::result::Result<T, GitError>;

/// Open a git repository at the given path
pub fn open_repo(path: &str) -> Result<Repository> {
    Repository::discover(path).map_err(|_| GitError::RepoNotFound(path.to_string()))
}

/// Get current diff (working directory vs HEAD)
pub fn get_current_diff(repo: &Repository) -> Result<DiffResult> {
    let head = repo.head()?.peel_to_tree()?;

    let mut diff_opts = DiffOptions::new();
    diff_opts.include_untracked(true);
    diff_opts.recurse_untracked_dirs(true);

    // Diff HEAD to workdir (includes staged + unstaged)
    let diff = repo.diff_tree_to_workdir_with_index(Some(&head), Some(&mut diff_opts))?;

    parse_diff(&diff, MAX_PATCH_SIZE)
}

/// Get file patch on demand (for lazy loading large files)
pub fn get_file_patch(repo: &Repository, file_path: &str) -> Result<String> {
    let head = repo.head()?.peel_to_tree()?;

    let mut diff_opts = DiffOptions::new();
    diff_opts.pathspec(file_path);

    let diff = repo.diff_tree_to_workdir_with_index(Some(&head), Some(&mut diff_opts))?;

    let mut patch = String::new();
    diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
        let origin = line.origin();
        if origin == '+' || origin == '-' || origin == ' ' {
            patch.push(origin);
        }
        if let Ok(content) = std::str::from_utf8(line.content()) {
            patch.push_str(content);
        }
        true
    })?;

    Ok(patch)
}

/// Get commit history with pagination
pub fn get_commit_history(repo: &Repository, limit: usize, offset: usize) -> Result<CommitHistory> {
    // First pass: count total commits
    let mut revwalk = repo.revwalk()?;
    revwalk.push_head()?;
    revwalk.set_sorting(git2::Sort::TIME)?;

    let total = revwalk.count();

    // Second pass: get commits with offset and limit
    let mut revwalk = repo.revwalk()?;
    revwalk.push_head()?;
    revwalk.set_sorting(git2::Sort::TIME)?;

    let commits: Vec<CommitInfo> = revwalk
        .skip(offset)
        .take(limit)
        .filter_map(|oid| oid.ok())
        .filter_map(|oid| repo.find_commit(oid).ok())
        .map(|commit| commit_to_info(&commit, repo))
        .collect();

    Ok(CommitHistory { commits, total })
}

/// Get diff for a specific commit
pub fn get_commit_diff(repo: &Repository, sha: &str) -> Result<CommitDiff> {
    let oid = git2::Oid::from_str(sha)?;
    let commit = repo.find_commit(oid)?;

    let parent_tree = if commit.parent_count() > 0 {
        Some(commit.parent(0)?.tree()?)
    } else {
        None // Initial commit
    };

    let commit_tree = commit.tree()?;

    let diff = repo.diff_tree_to_tree(parent_tree.as_ref(), Some(&commit_tree), None)?;
    let diff_result = parse_diff(&diff, usize::MAX)?;

    let commit_info = commit_to_info(&commit, repo);

    Ok(CommitDiff {
        commit: CommitInfo {
            stats: CommitStats {
                additions: diff_result.stats.additions,
                deletions: diff_result.stats.deletions,
                files: diff_result.stats.files,
            },
            ..commit_info
        },
        files: diff_result.files,
    })
}

/// Compare two branches
pub fn compare_branches(repo: &Repository, base: &str, head: &str) -> Result<CompareBranchesResult> {
    let base_ref = repo.resolve_reference_from_short_name(base)?;
    let head_ref = repo.resolve_reference_from_short_name(head)?;

    let base_commit = base_ref.peel_to_commit()?;
    let head_commit = head_ref.peel_to_commit()?;

    let base_tree = base_commit.tree()?;
    let head_tree = head_commit.tree()?;

    // Count commits between branches
    let mut revwalk = repo.revwalk()?;
    revwalk.push(head_commit.id())?;
    revwalk.hide(base_commit.id())?;
    let commit_count = revwalk.count();

    let diff = repo.diff_tree_to_tree(Some(&base_tree), Some(&head_tree), None)?;
    let diff_result = parse_diff(&diff, usize::MAX)?;

    Ok(CompareBranchesResult {
        files: diff_result.files,
        stats: diff_result.stats,
        commit_count,
    })
}

/// Get branch list
pub fn get_branches(repo: &Repository) -> Result<BranchList> {
    let head = repo.head()?;
    let current_branch = head
        .shorthand()
        .map(|s| s.to_string())
        .unwrap_or_default();

    let mut branches = Vec::new();

    for branch_result in repo.branches(Some(git2::BranchType::Local))? {
        let (branch, _) = branch_result?;
        let name = branch.name()?.unwrap_or("").to_string();
        let commit = branch.get().peel_to_commit()?.id().to_string();
        let is_current = branch.is_head();

        branches.push(BranchInfo {
            name,
            current: is_current,
            commit: commit[..7].to_string(),
        });
    }

    Ok(BranchList {
        branches,
        current: current_branch,
    })
}

/// Get file contents at a specific ref
pub fn get_file_contents(repo: &Repository, file_path: &str, git_ref: Option<&str>) -> Result<String> {
    match git_ref {
        Some(r) => {
            let obj = repo.revparse_single(&format!("{}:{}", r, file_path))?;
            let blob = obj.peel_to_blob()?;
            Ok(String::from_utf8_lossy(blob.content()).to_string())
        }
        None => {
            // Read from working directory
            let workdir = repo.workdir().ok_or_else(|| {
                GitError::Git(git2::Error::from_str("No working directory"))
            })?;
            let full_path = workdir.join(file_path);
            Ok(std::fs::read_to_string(full_path)?)
        }
    }
}

/// Get remote URL info
pub fn get_remote_url(repo: &Repository) -> Result<Option<RemoteInfo>> {
    let remote = match repo.find_remote("origin") {
        Ok(r) => r,
        Err(_) => return Ok(None),
    };

    let url = match remote.url() {
        Some(u) => u.to_string(),
        None => return Ok(None),
    };

    parse_remote_url(&url)
}

/// Parse remote URL to extract provider info
fn parse_remote_url(url: &str) -> Result<Option<RemoteInfo>> {
    // SSH format: git@github.com:owner/repo.git
    if url.starts_with("git@") {
        let parts: Vec<&str> = url.strip_prefix("git@").unwrap().split(':').collect();
        if parts.len() != 2 {
            return Ok(None);
        }
        let host = parts[0];
        let path = parts[1].trim_end_matches(".git");
        let path_parts: Vec<&str> = path.split('/').collect();
        if path_parts.len() < 2 {
            return Ok(None);
        }

        return Ok(Some(RemoteInfo {
            url: format!("https://{}/{}", host, path),
            provider: detect_provider(host),
            owner: path_parts[0].to_string(),
            repo: path_parts[1].to_string(),
        }));
    }

    // HTTPS format
    if let Ok(parsed) = url::Url::parse(url) {
        let host = parsed.host_str().unwrap_or("");
        let path = parsed.path().trim_start_matches('/').trim_end_matches(".git");
        let path_parts: Vec<&str> = path.split('/').collect();

        if path_parts.len() >= 2 {
            return Ok(Some(RemoteInfo {
                url: format!("https://{}/{}", host, path),
                provider: detect_provider(host),
                owner: path_parts[0].to_string(),
                repo: path_parts[1].to_string(),
            }));
        }
    }

    Ok(None)
}

fn detect_provider(host: &str) -> GitProvider {
    if host.contains("github") {
        GitProvider::Github
    } else if host.contains("gitlab") {
        GitProvider::Gitlab
    } else if host.contains("bitbucket") {
        GitProvider::Bitbucket
    } else {
        GitProvider::Unknown
    }
}

fn commit_to_info(commit: &Commit, repo: &Repository) -> CommitInfo {
    let sha = commit.id().to_string();
    let short_sha = sha[..7].to_string();
    let message = commit.message().unwrap_or("").to_string();
    let author = commit.author();
    let author_name = author.name().unwrap_or("").to_string();
    let author_email = author.email().unwrap_or("").to_string();

    // Format date as ISO 8601
    let time = commit.time();
    let datetime = chrono::DateTime::from_timestamp(time.seconds(), 0)
        .map(|dt| dt.format("%Y-%m-%dT%H:%M:%SZ").to_string())
        .unwrap_or_default();

    // Calculate stats
    let stats = calculate_commit_stats(commit, repo).unwrap_or(CommitStats {
        additions: 0,
        deletions: 0,
        files: 0,
    });

    CommitInfo {
        sha,
        short_sha,
        message,
        author: author_name,
        author_email,
        date: datetime,
        stats,
    }
}

fn calculate_commit_stats(commit: &Commit, repo: &Repository) -> Result<CommitStats> {
    let parent_tree = if commit.parent_count() > 0 {
        Some(commit.parent(0)?.tree()?)
    } else {
        None
    };

    let commit_tree = commit.tree()?;
    let diff = repo.diff_tree_to_tree(parent_tree.as_ref(), Some(&commit_tree), None)?;
    let stats = diff.stats()?;

    Ok(CommitStats {
        additions: stats.insertions(),
        deletions: stats.deletions(),
        files: stats.files_changed(),
    })
}

fn parse_diff(diff: &Diff, max_patch_size: usize) -> Result<DiffResult> {
    // Use RefCell to allow interior mutability in closures
    let files: RefCell<Vec<FileDiffInfo>> = RefCell::new(Vec::new());

    // First pass: collect file info
    diff.foreach(
        &mut |delta, _progress| {
            let path = delta.new_file().path()
                .or_else(|| delta.old_file().path())
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();

            let old_path = if delta.status() == Delta::Renamed {
                delta.old_file().path().map(|p| p.to_string_lossy().to_string())
            } else {
                None
            };

            let status = match delta.status() {
                Delta::Added | Delta::Untracked => FileStatus::Added,
                Delta::Deleted => FileStatus::Deleted,
                Delta::Renamed => FileStatus::Renamed,
                _ => FileStatus::Modified,
            };

            files.borrow_mut().push(FileDiffInfo {
                path,
                old_path,
                status,
                additions: 0,
                deletions: 0,
                old_content: None,
                new_content: None,
                patch: Some(String::new()),
                is_large: Some(false),
            });

            true
        },
        None,
        None,
        Some(&mut |delta, _hunk, line| {
            let mut files_mut = files.borrow_mut();
            if let Some(file) = files_mut.last_mut() {
                // Check if this is for the current file
                let current_path = delta.new_file().path()
                    .or_else(|| delta.old_file().path())
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_default();

                if file.path == current_path {
                    match line.origin() {
                        '+' => file.additions += 1,
                        '-' => file.deletions += 1,
                        _ => {}
                    }

                    // Build patch
                    if let Some(ref mut patch) = file.patch {
                        let origin = line.origin();
                        if origin == '+' || origin == '-' || origin == ' ' {
                            patch.push(origin);
                        }
                        if let Ok(content) = std::str::from_utf8(line.content()) {
                            patch.push_str(content);
                        }

                        // Check if patch is too large
                        if patch.len() > max_patch_size {
                            file.is_large = Some(true);
                            file.patch = Some(String::new());
                        }
                    }
                }
            }
            true
        }),
    )?;

    let files = files.into_inner();

    // Calculate totals
    let mut total_additions = 0;
    let mut total_deletions = 0;
    for file in &files {
        total_additions += file.additions;
        total_deletions += file.deletions;
    }

    let num_files = files.len();

    Ok(DiffResult {
        files,
        stats: DiffStats {
            additions: total_additions,
            deletions: total_deletions,
            files: num_files,
        },
    })
}
