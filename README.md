# Oronder: Discord

![](https://img.shields.io/badge/Foundry-v11-informational)
![Latest Release Download Count](https://img.shields.io/github/downloads/oronder/Oronder/latest/module.zip)
![Forge Installs](https://img.shields.io/badge/dynamic/json?label=Forge%20Installs&query=package.installs&suffix=%25&url=https%3A%2F%2Fforge-vtt.com%2Fapi%2Fbazaar%2Fpackage%2Foronder&colorB=4aa94a)

Oronder provides deep FoundryVTT Discord Integration. Access your character sheets, roll for downtime activities,
schedule sessions and reward exp all without needing to log back into Foundry. Oronder is designed to meet the needs of
running a complex Westmarches game with multiple DMs and players, but also shines for single party campaigns.

### Installation Instructions

_The following must be done by the owner of the Discord server you'd like to integrate with._

1. Invite
   the [Oronder Bot](https://discord.com/oauth2/authorize?client_id=1064553830810923048&scope=bot+guilds.members.read&permissions=403761728512)
   to your Discord.
2. Subscribe to the [Oronder Discord](https://discord.gg/27npDAXaCA) to gain access to advanced features.
3. From your Discord:
    - run `/admin init` supplying all required fields.
4. From Foundry, select **Game Settings > Configure Settings > Oronder > Configure Oronder**.
    - Set your _Authentication Token_ generated from the previous step.
    - Clicking `Fetch Discord User Ids` will populate Discord User Ids for players whose Discord name matches their
      Foundry name. For everyone else, you will need to manually add their Discord User Id.
    - Click `Save Changes`.

Players should now be able to access characters they own in Foundry from Discord. If a PC is not showing up ensure that
player ownership has been assigned and that the character has a class, race and background.