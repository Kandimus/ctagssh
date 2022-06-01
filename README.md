# CTags support via SSH
> An extension that provides CTags Support via SSH in Visual Studio Code.

## Additional Setup

### 1) .ctags file
You have to install [CTags](http://ctags.sourceforge.net/) and generate the .ctags file before you use this extension. Or manually copy .ctags file from remote host to project folder.

Run the CTags command under the your project folder.
```
ctags -R -f .ctags
```

### 2) Connect to remote host
Open settings and fill fields `host`, `port`, `username` and `password` to connect to remote host.

### 3) Support extension `SSH FS`
If the extension `SSH FS` is already installed you should to set check `ctagssh.usingSSHFS` on extension settings and select `SSH FS` profile for connect to remote host via command `ctagssh.menu`.

## Extension icon
The colour of extension icon indicate status of connection:
- Red - connection is not established
- Yellow - connecting to remote host
- Green - connected to remote host
- Blue - downloading file contains selected tag in progress

## Keybinding
Select the words in the vscode and the press `Shift+F12`.
Press `Ctrl+Shift+F12` to return to the previos tag.

## Command
| Command | Description |
|---|---|
| `ctagssh.gotoTag` | Go to definition of tag under cursor (`Shift+F12`). |
| `ctagssh.reconnect` | Reconnect to remote host when connection is not established. |
| `ctagssh.menu` | Opening extension quick menu. You also may be click on extension icon on StatusBar. |
| `ctagssh.back` | Return to the previos tag. |

## Issues
Please submit issues to [ctagssh](https://github.com/Kandimus/ctagsssh)

**Enjoy!**
