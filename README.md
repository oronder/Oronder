Oronder provides deep Discord integration for Foundry Virtual Tabletop. Access your character sheets, roll for
downtime activities, schedule sessions and reward exp directly from Discord. No struggling with Foundry from your phone.
No need for Foundry to be actively running.

Oronder is designed to meet the needs of running a complex Westmarches game with multiple DMs and players,
but also shines for single party campaigns.

### Installation Instructions

_The following must be done by the owner of the Discord server you'd like to integrate with._

1. Subscribe to the [Oronder Discord](https://discord.gg/Adg48Xrs6K) to gain access to advanced features and support.
2. Install and enable the Oronder Foundry Module.
3. From your Foundry instance, select `Game Settings` → `Configure Settings` → `Oronder` → `Configure Oronder`.
    1. Click the button to invite Oronder's App to your Discord Server.
        - A popup will ask you to select the server and verify permissions.
          Opera GX users or others with non-standard popup blockers may need to follow the instructions
          [here](https://discord.com/channels/860520082697617468/1144855605308301362/1221743284100272168).
    2. Associate Foundry Users to their associated Discord User.
        - Oronder will automatically assign matching names, but the rest are up to you.
    3. Configure Channels. Leaving them all set to #general is ok.
        - **_NOTE:_** If you configure Oronder to use private channels, you must invite Oronder to those channels!
    4. Click `Save Changes`.

Players should now be able to access characters they own in Foundry from Discord.
If a PC is not showing up, ensure that player ownership has been assigned and that the character has a class, race and
background.

### Self-Hosting

By default the module talks to Oronder's own server at `https://api.oronder.com` and there is nothing to configure.

If you run your own Oronder server, point the module at it in `Game Settings` → `Configure Settings` → `Oronder`:

| Setting                    | Value                                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Oronder Server**         | Your server's address, e.g. `https://oronder.example.com`. Blank means Oronder's server.              |
| **Discord Application Id** | Leave blank. Only needed for servers older than the `/config` endpoint, which report this themselves. |

Both take effect after a reload.

Your server has its own Discord application, and that application has to allow the module to pair with it:

1. In the [Discord Developer Portal](https://discord.com/developers/applications), open your application → `OAuth2` → `Redirects`.
2. Add the redirect your server reports at `<your server>/config`, usually `<your server>/init`, spelled exactly. Otherwise pairing fails at Discord's consent screen with _Invalid OAuth2 redirect_uri_.
3. Use a hostname with a domain suffix. Discord rejects bare hostnames such as `http://my-server:65435/init` with _Not a well formed URL_.
4. Under `Bot`, enable **Public Bot** only if people other than you need to invite it to their own Discord servers. If you're running Oronder for your own server, leave it off.

Note that an Oronder token is only valid on the server that issued it, so changing the **Oronder Server** setting means pairing with Discord again.

[![](https://img.shields.io/github/v/release/oronder/Oronder?style=for-the-badge)](https://github.com/oronder/Oronder/releases/latest)
[![](https://img.shields.io/badge/dynamic/json.svg?url=https%3A%2F%2Fraw.githubusercontent.com%2Foronder%2FOronder%2Fmain%2Fmodule.json&label=foundry&query=$.compatibility.verified&colorB=orange&style=for-the-badge&logo=foundryvirtualtabletop)](https://foundryvtt.com/releases/)
[![](https://img.shields.io/badge/dynamic/json.svg?url=https%3A%2F%2Fraw.githubusercontent.com%2Foronder%2FOronder%2Fmain%2Fmodule.json&label=dnd5e&query=$.relationships.systems[0].compatibility.verified&colorB=red&style=for-the-badge&logo=dungeonsanddragons)](https://github.com/foundryvtt/dnd5e/releases)
[![](https://img.shields.io/github/downloads/oronder/Oronder/module.zip?style=for-the-badge)](https://github.com/oronder/Oronder/releases/latest/download/module.zip)
[![](https://img.shields.io/discord/860520082697617468?label=discord&style=for-the-badge&logo=discord&color=5865F2&logoColor=white)](https://discord.gg/Adg48Xrs6K)
