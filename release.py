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
    major, minor, revision = [int(i) for i in subprocess.run(
        'git describe --abbrev=0 --tags',
        capture_output=True, shell=True, text=True
    ).stdout.strip('\n').split('.')]
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
