/* plan:
    read data from queue
    
    run node container 
        
    clone repo in container 
    
    cd root directory
    
    if there is build command then build the project 
    
    and then map the data to volume ,
    the data is production file if there is build other it will be all files
    
    then upload datat on azure
    
    then retutn message to another instance of queue, do not forget to sent also all build logs
*/
import Docker from 'dockerode';
import createProjectFolder from './handle_deployed_projects.js';
import fs from "fs";
import path from "path";
import deploy from './azure.js';
import { config } from "dotenv";

config();
/**
 * Initialize Docker client using the default socket.
 * @type {Docker}
 */
const docker = new Docker();

/**
 * Represents a job in the message queue that contains project details, repository link, build commands, and other metadata.
 * @type {Object}
 */
const messageQueueJob = {
    project_id: "6789",
    project_name: "test",
    build_no: "1",
    tokens: ["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"],
    configurations: {
        branch: "master",
        root_dir: "my-vite-app",
        build_command:  "npm run build",
        out_dir: "dist",
        env_vars: {
            PUBLIC_URL: "https://client-project.cloudastro.com",
        },
    },
    repo_url: "https://github.com/FadyAdel10/simple_vite_app_private.git",
};


// Call the function to create the project folder once
//let host_project_path = createProjectFolder();
//console.log('Project folder path:', host_project_path);

/**
 * Flags for build and output directory checks.
 */
let building_framework_flag = false;
let output_directory_flag = false;

// Check if a build command exists in the job data.
if (messageQueueJob.configurations.build_command) {
    building_framework_flag = true;
}

// Check if an output directory is defined.
if (messageQueueJob.configurations.out_dir) {
    output_directory_flag = true;
}


/**
 * Checks if the specified Docker image is available locally.
 * 
 * @param {string} imageName - The name of the Docker image to check.
 * @returns {Promise<boolean>} - Resolves to `true` if the image exists locally, otherwise `false`.
 */
const isDockerImageAvailable = async (imageName) => {
    const images = await docker.listImages();
    return images.some(image => image.RepoTags && image.RepoTags.includes(imageName));
};

// Prepare environment variables
const environmentVariables = Object.entries(messageQueueJob.configurations.env_vars)
.map(([key, value]) => `${key}=${value}`);

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
        const hostPath =  process.env.HOST_PATH /*createProjectFolder();*/
        const containerPath = '/usr/src/app';
        const temporary_path = '/temp' ; 
        // Create a Docker container
        console.log('Creating container...');
        const container = await docker.createContainer({
            Image: imageName,
            name: messageQueueJob.project_name,
            Cmd: [
                '/bin/bash',
                '-c',
                `
                # Clone the repo if the directory is empty
                if [ ! "$(ls -A ${temporary_path})" ]; then
                    echo "Cloning repository...";
                    git clone -b ${messageQueueJob.configurations.branch} ${messageQueueJob.repo_url} ${temporary_path};
                fi &&
                
                # Navigate to the project root directory
                cd ${temporary_path}/${messageQueueJob.configurations.root_dir} &&
            
                # Check and print environment variables
                echo "Testing environment variables..." &&
                printenv | grep PUBLIC_URL || echo "PUBLIC_URL not found." &&
            
                # Install dependencies if package.json exists
                if [ -f "package.json" ]; then
                    npm install;
                fi &&
            
                # Run the build command if specified
                ${building_framework_flag ? `${messageQueueJob.configurations.build_command} &&` : ''}
            
                # Copy files to the container path based on whether out_dir is empty
                if [ -n "${messageQueueJob.configurations.out_dir}" ]; then
                    echo "Copying from output directory...";
                    cp -r ${temporary_path}/${messageQueueJob.configurations.root_dir}/${messageQueueJob.configurations.out_dir} ${containerPath} ;
                else
                    echo "Output directory not specified, copying from root directory...";
                    cp -r ${temporary_path}/${messageQueueJob.configurations.root_dir}/* ${containerPath};
                fi &&
                # Debugging: Check paths and write to file
                echo "Creating finished.txt..." > ${containerPath}/finished.txt &&

                ls -l ${containerPath} &&
                echo "Operation completed"
                # Keep the container running
                tail -f /dev/null
                `,
            ],
            Tty: true,
            Env: environmentVariables,
            HostConfig: {
                Binds: [
                    // Bind mount a host directory to the container's directory
                    `${hostPath}:${containerPath}`,
                ],
            },
        });

        console.log('Container created with ID:', container.id);

        // Start the Docker container
        await container.start();
        console.log('Container started successfully');

    } catch (error) {
        console.error('Error starting container:', error);
    }
};

// Execute the Docker container workflow
await runDockerContainer();




const finishedFilePath = path.join(process.env.HOST_PATH, 'finished.txt');

// Busy-wait function to check for file existence
const waitForFinishedFile = async () => {
    const timeout = 1000 * 60 * 5; // 5 minutes timeout
    const interval = 1000 * 2; // check every 2 seconds
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
        try {
            await fs.promises.access(finishedFilePath, fs.constants.F_OK);
            console.log('Finished file detected.');
            return true; // File found
        } catch (err) {
            console.log('Waiting for finished.txt...');
            await new Promise(resolve => setTimeout(resolve, interval)); // Wait for a short time before checking again
        }
    }

    console.error('Timeout reached, finished.txt not found.');
    return false; // Timeout reached without finding the file
};
// Wait for finished.txt to appear
const fileFound = await waitForFinishedFile();
if (fileFound) {
    console.log('Proceeding with deployment...');
    deploy(messageQueueJob.project_name, process.env.HOST_PATH);
}







//deploy(messageQueueJob.configurations.project_name,process.env.HOST_PATH);

export { messageQueueJob } ;
//remove docker container

