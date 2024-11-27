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

import runDockerContainer from './docker_functions/runDockerContainer_handler.js';

import { config } from "dotenv";

console.log("env_name: ",process.env.name);
config();


/**
 * Represents a job in the message queue that contains project details, repository link, build commands, and other metadata.
 * @type {Object}
 */

const messageQueueJob = {
    project_id: "697",
    project_name: "test",
    build_no: "1",
    tokens: ["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"],
    configurations: {
        branch: "master",
        root_dir: "my-vite-app",
        build_command: 'npm run build'/*"undefined"*/,//''
        out_dir: "dist",
        env_vars: {
            PUBLIC_URL: "https://client-project.cloudastro.com",
        },
    },
    repo_url: "https://github.com/FadyAdel10/simple_vite_app_private.git",
};

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

// Set PUBLIC_URL to container
// TODO: change last part (project_name -> container_name) [when implemented in backend]
const setPublicURL = (messageQueueJob) => {
    messageQueueJob.configurations.env_vars.PUBLIC_URL = `https://${process.env.AZURE_STORAGE_CONNECTION_STRING.match(/AccountName=([^;]+)/)?.[1]}.blob.core.windows.net/${messageQueueJob.project_name}`
    console.log(`Setting PULIC_URL to ${messageQueueJob.configurations.env_vars.PUBLIC_URL}`)
}


// Check if project is Vite (out_dir == dist) and modify build command accordingly
if (messageQueueJob.configurations.out_dir === 'dist') {
    messageQueueJob.configurations.build_command = messageQueueJob.configurations.build_command + ' -- --base=./'
}

// Set environment variable PUBLIC_URL to point at container 
setPublicURL(messageQueueJob);



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












// Execute the Docker container workflow
runDockerContainer();

export { messageQueueJob , building_framework_flag , environmentVariables , output_directory_flag , buildCommand} ;
//remove docker container






























// /* plan:
//     read data from queue
    
//     run node container 
        
//     clone repo in container 
    
//     cd root directory
    
//     if there is build command then build the project 
    
//     and then map the data to volume ,
//     the data is production file if there is build other it will be all files
    
//     then upload datat on azure
    
//     then retutn message to another instance of queue, do not forget to sent also all build logs
// */

// import Docker from 'dockerode';
// import createProjectFolder from './handle_deployed_projects.js';
// import runDockerContainer from './docker_functions/runDockerContainer_handler.js';
// import waitForFinishedFile from './fileSystem_functions/flagToStartDeploy_handler.js'
// import deploy from './azure.js';
// import { config } from "dotenv";

// config();
// /**
//  * Initialize Docker client using the default socket.
//  * @type {Docker}
//  */
// const docker = new Docker();

// /**
//  * Represents a job in the message queue that contains project details, repository link, build commands, and other metadata.
//  * @type {Object}
//  */
// const messageQueueJob = {
//     project_id: "6789",
//     project_name: "test",
//     build_no: "1",
//     tokens: ["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"],
//     configurations: {
//         branch: "master",
//         root_dir: "",
//         build_command:  "npm run build",
//         out_dir: "build",
//         env_vars: {
//             PUBLIC_URL: "https://client-project.cloudastro.com",
//         },
//     },
//     repo_url: "https://github.com/FadyAdel10/simple_react_app_private.git",
// };

// /**
//  * Flags for build and output directory checks.
//  */
// let building_framework_flag = false;
// let output_directory_flag = false;

// // Check if a build command exists in the job data.
// if (messageQueueJob.configurations.build_command) {
//     building_framework_flag = true;
// }

// // Check if an output directory is defined.
// if (messageQueueJob.configurations.out_dir) {
//     output_directory_flag = true;
// }
// // Prepare environment variables
// const environmentVariables = Object.entries(messageQueueJob.configurations.env_vars)
// .map(([key, value]) => `${key}=${value}`);


// // Execute the Docker container workflow
// await runDockerContainer();

// // Wait for finished.txt to appear
// const fileFound = await waitForFinishedFile();
// if (fileFound) {
//     console.log('Proceeding with deployment...');
//     deploy(messageQueueJob.project_name, process.env.HOST_PATH);
// }

// export { messageQueueJob , building_framework_flag , output_directory_flag , docker , environmentVariables } ;
// //remove docker container

