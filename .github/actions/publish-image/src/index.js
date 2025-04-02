#!/usr/bin/env node

const github = require('@actions/github');
const core = require('@actions/core');
const { exec } = require('@actions/exec');
const fs = require('fs');
const path = require('path');

function getInputs() {
    const { owner } = github.context.repo;
    const name = core.getInput('image');
    const push = true ? core.getInput('push') === 'true' : false;
    const registry = core.getInput('registry') || 'ghcr.io';
    const repository = core.getInput('repository') || `${owner}/devcontainer-images`;
    const username = core.getInput('username') || owner;
    const password = core.getInput('password') || process.env.GITHUB_TOKEN;

    if (!name) {
        throw new Error('Image name not provided');
    }

    if (!password) {
        throw new Error('Password not provided');
    } else {
        core.setSecret(password);
    }

    if (!registry) {
        throw new Error('Registry not provided');
    }

    if (!repository) {
        throw new Error('Repository not provided');
    }

    return {
        name,
        push,
        registry,
        repository,
        username,
        password,
    };
}

function getWorkspaceFolder(name) {
    const workspace = process.env.GITHUB_WORKSPACE;
    if (!workspace) {
        throw new Error('GITHUB_WORKSPACE not set');
    }

    if (!name) {
        throw new Error('Image name not provided');
    }

    if (!fs.existsSync(workspace)) {
        throw new Error(`Workspace directory does not exist: ${workspace}`);
    }

    return path.join(workspace, 'images', 'src', name)
}

function getImageManifest(workspaceFolder) {
    const manifestPath = path.join(workspaceFolder, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
        throw new Error(`Manifest file does not exist: ${manifestPath}`);
    }

    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

function parseImageManifest(registry, repository, manifest) {
    if (!manifest) {
        throw new Error('Manifest is empty or undefined');
    }

    with (manifest) {
        if (!version || !name || !variant || !rootDistro || !description || !aliases || !architectures) {
            throw new Error('Invalid manifest format');
        }

        const versionParts = version.split('.');
        const [ major, minor, patch ] = versionParts.map(part => {
            const num = parseInt(part);
            if (isNaN(num)) {
                throw new Error('Invalid version format');
            }
            return num;
        });

        let tags = [];
        if (latest) {
            tags.push(`${registry}/${repository}/${name}:latest`);
        }

        tags.push(`${registry}/${repository}/${name}:${variant}`);
        tags.push(`${registry}/${repository}/${name}:${major}-${variant}`);
        tags.push(`${registry}/${repository}/${name}:${major}.${minor}-${variant}`);
        tags.push(`${registry}/${repository}/${name}:${major}.${minor}.${patch}-${variant}`);

        if (aliases.length) {
            aliases.forEach(alias => {
                tags.push(`${registry}/${repository}/${name}:${alias}`);
            });
        }

        return {
            name,
            variant,
            version: `${major}.${minor}.${patch}`,
            description,
            rootDistro,
            tags,
            architectures: architectures.length ? architectures : []
        };
    }
}

async function run() {
    const inputs = getInputs();
    const octokit = github.getOctokit(inputs.password);
    const workspaceFolder = getWorkspaceFolder(inputs.name);
    const manifest = parseImageManifest(
        inputs.registry,
        inputs.repository,
        getImageManifest(workspaceFolder),
    );

    core.startGroup('Image manifest');
    core.info(`name: ${manifest.name}`);
    core.info(`variant: ${manifest.variant}`);
    core.info(`version: ${manifest.version}`);
    core.info(`description: ${manifest.description}`);
    core.info(`tags:\n  - ${manifest.tags.join('\n  - ')}`);
    core.info(`architectures:\n  - ${manifest.architectures.join('\n  - ')}`);
    core.endGroup();

    core.setOutput('name', `${manifest.name}`);
    core.setOutput('version', manifest.version);
    core.setOutput('description', manifest.description);
    core.setOutput('tags', JSON.stringify(manifest.tags));
    core.setOutput('architectures', JSON.stringify(manifest.architectures));
    core.setOutput('outcome', 'unknown');

    let imageExists = false;
    await octokit.rest.packages.getAllPackageVersionsForPackageOwnedByUser({
        package_type: 'container',
        package_name: `devcontainer-images/${manifest.name}`,
        username: inputs.username,
        per_page: 100,
    }).then(response => {
        for (const tags of response.data.map(image => image.metadata.container.tags)) {
            if (tags.includes(`${manifest.version}-${manifest.variant}`)) {
                imageExists = true;
                break;
            }
        }
    }).catch(error => {
        if (!error.message.startsWith('Package not found')) {
            throw error;
        }
    });

    if (imageExists) {
        core.info(`Skipping devcontainer-images/${manifest.name}:${manifest.version}-${manifest.variant}: Image version already exists...`);
        core.setOutput('outcome', 'skipped');
        return;
    }

    if (inputs.push) {
        await core.group('Registry login', async () => exec(
            "docker",
            [
                "login",
                `--username='${inputs.username}'`,
                `--password-stdin`,
                `${inputs.registry}`,
            ],
            {
                input: Buffer.from(`${inputs.password}\n`)
            }
        ));
    }

    try {
        await core.group('Image build', async () => exec(
            "npx",
            [
                "@devcontainers/cli",
                "build",
                `--push='${inputs.push}'`,
                `--platform='${manifest.architectures.join(',')}'`,
                `--workspace-folder='${workspaceFolder}'`,
                ...manifest.tags.map(tag => `--image-name='${tag}'`),
            ],
            {
                cwd: workspaceFolder,
                env: {
                    ...process.env,
                    DOCKER_BUILDKIT: 1,
                }
            }
        ));

        core.setOutput('outcome', 'success');
    } finally {
        if (inputs.push) {
            await core.group('Registry logout', async () => exec(
                "docker",
                [
                    "logout",
                    `${inputs.registry}`,
                ],
            ).catch(error => {
                core.warning(error.message);
            }));
        }
    }

    await octokit.rest.git.createRef({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        ref: `refs/tags/image_${manifest.name}_${manifest.version}`,
        sha: github.context.sha,
    }).catch(error => {
        core.warning(error.message);
    });
}

run().catch(error => {
    core.setOutput('outcome', 'failed');
    core.setFailed(error.message);
});
