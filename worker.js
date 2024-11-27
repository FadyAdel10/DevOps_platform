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
import { config } from "dotenv";
import { dockerExec } from './dockerExec.js';

console.log("env_name: ",process.env.name);
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
    project_id: "6786",
    project_name: "test",
    build_no: "1",
    tokens: ["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"],
    configurations: {
        branch: "master",
        root_dir: "my-vite-app",
        build_command: "npm run build",
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

// concat env_variables to the build command
let buildCommand = "";
Object.keys(messageQueueJob.configurations.env_vars).forEach(key=>{
    buildCommand += `${key}=$${key} `
});
buildCommand += messageQueueJob.configurations.build_command;

console.log(buildCommand);


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
            ${building_framework_flag ? `${messageQueueJob.configurations.build_command} &&` : ''}

            # check the build files (ls -a)
            echo "Checking for build files: "
            ls -a

            # copy build files to the binding directory
            ${output_directory_flag ? `cp -r ./${messageQueueJob.configurations.out_dir} ${bindingDir} &&`:`cp -r * ${bindingDir}`}
            
            echo "Files were copied"

            # Keep the container running
            # tail -f /dev/null
        `];

        const cloneCMD = ['/bin/bash', '-c', `
            # Check if the directory is empty and clone the repo
            if [ ! "$(ls -A ${containerPath})" ]; then
                echo "Cloning repository...";
                git clone -b ${messageQueueJob.configurations.branch} ${messageQueueJob.repo_url} ${containerPath};
            fi && 
            # Navigate to the project root directory
            cd ${containerPath}/${messageQueueJob.configurations.root_dir}`
        ];

        // const cloneCMD = ['git', 'clone', '-b', repoUrl, targetDir];

        // Start the Docker container
        await container.start();
        console.log('Container started successfully');

        dockerExec(container,0);

        // const cloneExec = await container.exec({
        //     cmd: cloneCMD,
        //     AttachStdout: true,
        //     AttachStderr: true
        // });

        // const cloneStream = await cloneExec.start({});

        // cloneStream.on('data', (data) => {
        //     console.log(data.toString()); // Print output from the container
        // });

        // cloneStream.on('error', (error) => {
        //     console.error(error.message); // Print output from the container
        // });

        // cloneStream.on('end', async () => {
        //     console.log("Clone ended"); // Print output from the container
        //      // Check the exit code
        //     const result = await cloneExec.inspect();
        //     if (result.ExitCode !== 0) {
        //         console.error(`Command failed with exit code ${result.ExitCode}`);
        //     } else {
        //         console.log('Command executed successfully.');
        //     }
        // });

        // Exec commands in the container container
        // const exec = await container.exec({
        //     cmd: cloneCMD,
        //     // AttachStdin: true,
        //     AttachStdout: true,
        //     AttachStderr: true
        // })

        // start logs streaming 
        // const stream = await exec.start({});

        // stream.on("data",(data)=>{  // when new output
        //     logs += data.toString();
        //     console.log(data.toString())
        // })

        // stream.on("error", (err)=>{
        //     console.error("error in stream:", err)
        // })

        // stream.on("end",async ()=>{ 
        //     console.log("End of stream.");
        //     console.log(logs);

        //     const result = await exec.inspect();
        //     console.error(`Command exited with code ${result.ExitCode}`);
        //     // deploy()
        // })

        
        // if (result.ExitCode !== 0) {
        // }    

        // console.log('Container created with ID:', container.id);

        

    } catch (error) {
        console.error('Error starting container:', error);
    }
};

// Execute the Docker container workflow
runDockerContainer();

export { messageQueueJob } ;
//remove docker container

