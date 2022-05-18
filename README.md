# CTags support on SSH
> An extension that provides CTags Support via SSH in Visual Studio Code.

## Additional Setup

### 1) .ctags file
You have to install [CTags](http://ctags.sourceforge.net/) and generate the .ctags file before you use this extension. Or manually copy .ctags file from remote host to local.

Run the CTags command under the your project folder.
```
ctags -R -f .ctags
```

### 2) Connect to remote host
Open settings and fill fields `host`, `port`, `username` and `password` to connect to remote host.

## Keybinding
Select the words in the vscode and the press `shift + f12`.

## Issues
Please submit issues to [ctagssh](https://github.com/Kandimus/ctagsssh)

**Enjoy!**
