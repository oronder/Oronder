import subprocess

import click


@click.command()
@click.option('--release', '-r',
              default='revision',
              show_default=True,
              type=click.Choice(['major', 'minor', 'revision'])
              )
def run_release(release):
    subprocess.run('git pull', shell=True)
    major, minor, revision = max(
        [
            [int(v) for v in t.split('.')]
            for t in
            subprocess.run('git tag -l', capture_output=True, shell=True, text=True).stdout.strip('\n').split('\n')
            if t != 'latest'
        ],
        key=lambda triple: (triple[0], triple[1], triple[2])
    )

    match release:
        case 'major':
            major += 1
        case 'minor':
            minor += 1
        case 'revision':
            revision += 1
        case _:
            raise ValueError('huh')

    tag = f'{major}.{minor}.{revision}'
    subprocess.run(f'git tag {tag} && git push origin {tag}', shell=True)


if __name__ == '__main__':
    run_release()
