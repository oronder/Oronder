import html
import json
import os
import re
from html.parser import HTMLParser
from http.client import HTTPSConnection
from pprint import pformat
from typing import List
from urllib.parse import urlencode

from markdown_it import MarkdownIt

# Secrets
FOUNDRY_PACKAGE_RELEASE_TOKEN = os.environ['FOUNDRY_PACKAGE_RELEASE_TOKEN']
FOUNDRY_USERNAME = os.environ['FOUNDRY_USERNAME']
FOUNDRY_PASSWORD = os.environ['FOUNDRY_PASSWORD']
FOUNDRY_AUTHOR = os.environ['FOUNDRY_AUTHOR']
UPDATE_DISCORD_KEY = os.environ['UPDATE_DISCORD_KEY']
SECRETS = [FOUNDRY_PACKAGE_RELEASE_TOKEN, FOUNDRY_USERNAME, FOUNDRY_PASSWORD, FOUNDRY_AUTHOR, UPDATE_DISCORD_KEY]

# Environment Variables
GITHUB_URL = os.environ['GITHUB_URL']
TAG = os.environ['TAG']
CHANGES = os.environ['CHANGES']
FILES_CHANGED = os.environ['FILES_CHANGED']
# Set by the package_page workflow: update the foundryvtt.com package page
# from main without publishing a release.
PACKAGE_PAGE_ONLY = bool(os.environ.get('PACKAGE_PAGE_ONLY'))

# foundryvtt.com's numeric package id for each system module.json can declare,
# with the title its package edit form shows for that id. The title is checked
# against the live form before posting, so a wrong id can't silently list the
# wrong system. To support another system, add it here: the id is the value of
# its option in the Systems list on the package edit page.
FOUNDRY_SYSTEMS = {
    'dnd5e': (1, 'Dungeons & Dragons Fifth Edition'),
    'pf2e': (6, 'Pathfinder Second Edition'),
    'blades-in-the-dark': (141, 'Blades In The Dark'),
    'CoC7': (367, 'Call of Cthulhu 7th edition'),
    'gurps': (642, 'GURPS 4th Edition Game Aid (Unofficial)'),
    'fallout': (1358, 'Fallout: The Roleplaying Game'),
}


def main():
    with open('./module.json', 'r') as file:
        module_json = json.load(file)
    if PACKAGE_PAGE_ONLY:
        update_repo_description(module_json)
        return
    if all(f.startswith('.github') for f in FILES_CHANGED.split()):
        SKIP('SKIPPING DEPLOYMENT. ONLY RELEASE CONFIG MODIFIED')
        for f in FILES_CHANGED.split():
            INFO(f)

        push_release(module_json, True)
    else:
        update_repo_description(module_json)
        push_release(module_json, False)
        post_update_to_discord()


def update_repo_description(module_json):
    if not PACKAGE_PAGE_ONLY and not any(f in FILES_CHANGED for f in ['README.md', 'module.json', 'foundry_release.py']):
        SKIP('SKIPPING REPO DESCRIPTION UPDATE')
        return

    INFO('Acquiring CSRF tokens')
    conn = HTTPSConnection('foundryvtt.com')
    conn.request('GET', '/', headers={})
    response = conn.getresponse()
    if response.status != 200:
        BAD(response.reason)
    csrf_token = response.getheader('Set-Cookie').split('csrftoken=')[1].split(';')[0].strip()
    csrf_middleware_token = re.search(r'name="csrfmiddlewaretoken" value="([^"]+)"', response.read().decode()).group(1)

    INFO('Acquiring session id')
    conn = HTTPSConnection('foundryvtt.com')
    conn.request('POST', '/auth/login/',
                 headers={
                     'Referer': 'https://foundryvtt.com/',
                     'Content-Type': 'application/x-www-form-urlencoded',
                     'Cookie': f'csrftoken={csrf_token}; privacy-policy-accepted=accepted'
                 },
                 body=urlencode({
                     'csrfmiddlewaretoken': csrf_middleware_token,
                     'username': FOUNDRY_USERNAME,
                     'password': FOUNDRY_PASSWORD
                 }))
    response = conn.getresponse()
    if response.status == 403:
        BAD(response.reason)
    INFO(f'Login responded {describe(response)}')
    cookies = response.getheader('Set-Cookie') or ''
    if 'sessionid=' not in cookies:
        WARN('Login set no session cookie')
        SKIP('SKIPPING REPO DESCRIPTION UPDATE: package page left unchanged')
        return
    session_id = cookies.split('sessionid=')[1].split(';')[0].strip()

    INFO('Reading the package edit form')
    conn = HTTPSConnection('foundryvtt.com')
    conn.request('GET', f"/packages/{module_json['id']}/edit",
                 headers={
                     'Referer': f"https://foundryvtt.com/packages/{module_json['id']}",
                     'Cookie': f'csrftoken={csrf_token}; privacy-policy-accepted=accepted; sessionid={session_id}',
                 })
    response = conn.getresponse()
    edit_form = response.read().decode() if response.status == 200 else ''
    INFO(f'Edit form responded {describe(response)}')
    if edit_form:
        INFO(f'Edit form page: {page_summary(edit_form)}')
    systems = form_systems(module_json, edit_form)
    if systems is None:
        return

    INFO('Converting README.md to html')
    md = MarkdownIt('commonmark', {'html': True}).enable('table')
    with open('./README.md', 'r') as readme_file:
        readme_contents = readme_file.read()
    readme = md.render(readme_contents)

    INFO('Updating Foundry VTT Module Repository Description')
    conn = HTTPSConnection('foundryvtt.com')
    conn.request('POST', f"/packages/{module_json['id']}/edit",
                 headers={
                     'Referer': f"https://foundryvtt.com/packages/{module_json['id']}/edit",
                     'Content-Type': 'application/x-www-form-urlencoded',
                     'Cookie': f'csrftoken={csrf_token}; privacy-policy-accepted=accepted; sessionid={session_id}',
                 },
                 body=urlencode([
                     ('username', FOUNDRY_USERNAME),
                     ('title', module_json['title']),
                     ('description', readme),
                     ('url', module_json['url']),
                     ('csrfmiddlewaretoken', csrf_middleware_token),
                     ('author', FOUNDRY_AUTHOR),
                     ('secret-key', FOUNDRY_PACKAGE_RELEASE_TOKEN),
                     *systems,
                     ('tags', 7),  # Chat Log and Messaging
                     ('tags', 15)  # External Integrations
                     #                      ('tags', 17) # Contains Paid Features
                 ]))
    response = conn.getresponse()
    INFO(f'Edit form submit responded {describe(response)}')
    if response.status != 302:
        errs = ''.join([f'\n- {c}' for c in extract_errorlist_text(response.read().decode())])
        BAD(f'Update Description Failed{errs}')
    GOOD('REPO DESCRIPTION UPDATED')


def describe(response) -> str:
    """An HTTP response's status, and where it redirects to, for the log."""
    location = response.getheader('Location')
    return f'{response.status} {response.reason}' + (f' -> {location}' if location else '')


def page_summary(page: str) -> str:
    """
    A page's title and the names of its form fields, for the log: enough to
    tell the package edit form from a login page or a redirect target, without
    printing any field values.
    """
    title = re.search(r'<title[^>]*>(.*?)</title>', page, re.S)
    fields = dict.fromkeys(re.findall(r'<(?:input|select|textarea)[^>]*\bname="([^"]+)"', page))
    return f"title {html.unescape(title.group(1)).strip()!r}, fields {', '.join(fields) or 'none'}" if title \
        else f"no title, fields {', '.join(fields) or 'none'}"


def form_systems(module_json: dict, edit_form: str):
    """
    The package edit form's `systems` values for the systems module.json
    declares, or None if they can't be trusted, in which case the package page
    is left as it is rather than risk listing the wrong systems. The release
    itself is never blocked by this.

    The ids are checked against the form's systems list when it has one. Its
    HTML no longer does (the selector may be drawn client-side), and the ids
    in FOUNDRY_SYSTEMS are the ones this script has always posted, so then
    they're posted as they are.
    """
    declared = [s['id'] for s in module_json['relationships'].get('systems', [])]
    select = re.search(r'<select[^>]*name="systems"[^>]*>(.*?)</select>', edit_form, re.S)
    options = {
        int(value): html.unescape(re.sub(r'<[^>]+>', '', label)).strip()
        for value, label in re.findall(r'<option[^>]*value="(\d+)"[^>]*>(.*?)</option>', select.group(1), re.S)
    } if select else {}

    systems, problems = [], []
    if not options:
        WARN('The edit form has no systems list to check against; posting the known ids unchecked')
    for system in declared:
        if system not in FOUNDRY_SYSTEMS:
            problems.append(f'no foundryvtt.com id for "{system}"; add it to FOUNDRY_SYSTEMS')
            continue
        number, title = FOUNDRY_SYSTEMS[system]
        # Compared loosely: foundryvtt.com's titles don't always match the
        # system.json's capitalization ("7th edition" vs "7th Edition").
        if options and ' '.join(str(options.get(number)).split()).casefold() != title.casefold():
            problems.append(f'foundryvtt.com system {number} is {options.get(number)!r}, expected {title!r} for "{system}"')
            continue
        systems.append(('systems', number))

    INFO(f'Systems declared in module.json: {", ".join(declared) or "none"}')
    if problems or not systems:
        for problem in problems:
            WARN(problem)
        WARN(f'Systems that would have been posted: {", ".join(str(n) for _, n in systems) or "none"}')
        SKIP('SKIPPING REPO DESCRIPTION UPDATE: package page left unchanged')
        return None
    INFO(f'Systems posted to the package page: {", ".join(str(n) for _, n in systems)}')
    return systems


def push_release(module_json: dict, dry_run: bool) -> None:
    INFO(f'{"Testing" if dry_run else "Pushing"} new release to Foundry VTT Module Repository')
    conn = HTTPSConnection("api.foundryvtt.com", timeout=120)
    conn.request(
        "POST", "/_api/packages/release_version/",
        headers={
            'Content-Type': 'application/json',
            'Authorization': FOUNDRY_PACKAGE_RELEASE_TOKEN
        },
        body=json.dumps({
            'id': module_json['id'],
            'dry-run': dry_run,
            'release': {
                'version': TAG,
                'manifest': f"{GITHUB_URL}/releases/download/{TAG}/module.json",
                'notes': f"{GITHUB_URL}/releases/tag/{TAG}",
                'compatibility': module_json['compatibility']
            }
        })
    )
    response = conn.getresponse()
    response_json = json.loads(response.read().decode())
    if dry_run:
        INFO(pformat(response_json))
        return
    if 'status' not in response_json:
        WARN(f'{response=}\n\n{response.status=}\n\n{pformat(response_json)}')
    if response_json['status'] != 'success':
        BAD(pformat(response_json['errors']))

    GOOD('MODULE POSTED TO REPO')


def post_update_to_discord() -> None:
    INFO('Notifying Discord of new release')
    deduped_changes = list(dict.fromkeys(CHANGES.split('\n')))
    conn = HTTPSConnection("api.oronder.com")
    conn.request(
        "POST", '/update_discord',
        headers={
            'Content-Type': 'application/json',
            'Authorization': UPDATE_DISCORD_KEY
        },
        body=json.dumps({'version': TAG, 'changes': deduped_changes})
    )
    response = conn.getresponse()
    if response.status != 200:
        content = response.read().decode()
        headers = response.headers.as_string()
        BAD(f'Failed to send Update Message to Discord\n{content=}\n{headers=}')
    GOOD('DISCORD NOTIFIED OF NEW RELEASE')


def extract_errorlist_text(html_string: str) -> List[str]:
    class ErrorListParser(HTMLParser):
        in_errorlist = False
        errorlist_content = []

        def handle_starttag(self, tag, attrs):
            if tag == "ul":
                for attr, value in attrs:
                    if attr == "class" and "errorlist" in value:
                        self.in_errorlist = True

        def handle_endtag(self, tag):
            if tag == "ul" and self.in_errorlist:
                self.in_errorlist = False

        def handle_data(self, data):
            if self.in_errorlist:
                self.errorlist_content.append(data.strip())

    parser = ErrorListParser()
    parser.feed(html_string)
    return parser.errorlist_content


def safe_print(s: str):
    for secret in SECRETS:
        s = s.replace(secret, '*****')
    print(s)


def INFO(s: str):
    safe_print(f'  {s}')


def SKIP(s: str):
    safe_print(f'🪧 {s}')


def GOOD(s: str):
    safe_print(f'✅ {s}')


def WARN(s: str):
    safe_print(f'❓ {s}')


def BAD(s: str):
    safe_print(f'❌ {s}')
    exit(1)


if __name__ == '__main__':
    main()
