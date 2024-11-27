import isDockerImageAvailable from './image_handler.js'
import { docker } from './image_handler.js'
import { environmentVariables , building_framework_flag , output_directory_flag , buildCommand} from "../worker.js"
import { messageQueueJob  } from '../worker.js';
import { AzureService } from '../azure.js';
import { config } from "dotenv";

config();

/**
 * Runs a Docker container to clone a repository, install dependencies, optionally build the project,
 * and start the application.
 */
const runDockerContainer = async () => {
    try {
        const imageName = 'node:18-buster';

        // Check if the Docker image is available locally.
        console.log(`Checking if the image ${imageName} exists locally...`);
        const imageExists = await isDockerImageAvailable(imageName);

        if (!imageExists) {
            console.log(`${imageName} is not found locally.`);
        } else {
            console.log(`${imageName} found locally.`);
        }

        // Paths for mounting volumes between host and container
        const hostPath = process.env.HOST_PATH + `/${messageQueueJob.project_name}${messageQueueJob.project_id}` //`${process.env.HOST_PATH}`; /*createProjectFolder();*/
        const containerPath = '/usr/src/app';
        const bindingDir = '/usr/src/buildDir';
        let logs = "";
        // Create a Docker container
        console.log('Creating container...');
        const container = await docker.createContainer({
            Image: imageName,
            name: messageQueueJob.project_name + messageQueueJob.project_id,
            Tty: true,
            Env: environmentVariables,
            HostConfig: {
                Binds: [
                    // Bind mount a host directory to the container's directory
                    `${hostPath}:${bindingDir}`,
                ],
            },
        });

        const cmd = ['/bin/bash', '-c', `
            # Check if the directory is empty and clone the repo
            if [ ! "$(ls -A ${containerPath})" ]; then
                echo "Cloning repository...";
                git clone -b ${messageQueueJob.configurations.branch} ${messageQueueJob.repo_url} ${containerPath};
            fi &&
        
            # Navigate to the project root directory
            cd ${containerPath}/${messageQueueJob.configurations.root_dir} &&
        
            # Check and print environment variables
            echo "Testing environment variables..." &&
            printenv | grep PUBLIC_URL || echo "PUBLIC_URL not found." &&
        
            # Install dependencies if package.json exists
            if [ -f "package.json" ]; then
                npm install;
            fi &&   
        
            # Run build command if specified
            ${building_framework_flag ? `${buildCommand/*messageQueueJob.configurations.build_command*/} &&` : ''}

            # check the build files (ls -a)
            echo "Checking for build files: "
            ls -a

            # copy build files to the binding directory
            ${output_directory_flag ? `cp -r ./${messageQueueJob.configurations.out_dir} ${bindingDir} &&`:`cp -r * ${bindingDir}`}
            
            echo "Files were copied"

            # Keep the container running
            # tail -f /dev/null
        `];
            
        // Start the Docker container
        await container.start();
        console.log('Container started successfully');

        // Exec commands in the container container
        const exec = await container.exec({
            cmd: cmd,
            // AttachStdin: true,
            AttachStdout: true,
            AttachStderr: true
        })

        // start logs streaming 
        const stream = await exec.start({});

        stream.on("data",(data)=>{  // when new output
            logs += data.toString();
            console.log(data.toString())
        })

        stream.on("error", (err)=>{
            console.error("error in stream:", err)
        })

        stream.on("end",()=>{ 
            console.log("End of stream.");
            console.log(logs);
            AzureService.deploy(messageQueueJob.project_name+messageQueueJob.project_id, process.env.HOST_PATH+`/${messageQueueJob.project_name}${messageQueueJob.project_id}`);
             //deploy(messageQueueJob.project_name+messageQueueJob.project_id, process.env.HOST_PATH+`/${messageQueueJob.project_name}${messageQueueJob.project_id}`);
        })

        console.log('Container created with ID:', container.id);

        

    } catch (error) {
        console.error('Error starting container:', error);
    }
};

export default runDockerContainer