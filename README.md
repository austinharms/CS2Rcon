# CS2 Server Manager
A web interface for managing dedicated CS2 servers using RCON *see below* 
![Web Interface](https://github.com/austinharms/CS2ServerManager/blob/master/imgs/web.png?raw=true)

## Requirements
- NodeJS
## Getting Started
1. Download the repository onto the CS2 server (or any server that can connect to the CS2 server)
2. Install node dependencies by executing `npm i` in the root repository folder
3. Run the web server using `npm run start`  
The application can be configured using the following command line arguments:
- `-port` The port used by RCON to connect to the CS2 server, *default: `27015`*
- `-address` The ip address used by RCON to connect to the CS2 server, *default: `127.0.0.1`*
- `-password` The password used by RCON to authenticated to the CS2 server, *default: `0`*
- `-webport` The port used to host the web interface, *default: `8080`*  
Ex: `npm run start -port 27015 -address 127.0.0.1 -password my long password -webport 80`
