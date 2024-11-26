import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { messageQueueJob  } from './worker.js';

/**
 * Create the folder dynamically based on the current path
 * and the project name from the message queue job.
 */
const createProjectFolder = () => {
    // Get the directory of the current script
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    // Paths for the deployed projects folder
    const deployedProjectsPath = path.join(__dirname, 'deployed_projects');
    
    // Ensure the 'deployed_projects' folder exists
    if (!fs.existsSync(deployedProjectsPath)) {
        fs.mkdirSync(deployedProjectsPath);
        console.log('Created "deployed_projects" folder at:', deployedProjectsPath);
    }

    // Create a new project folder inside deployed_projects
    const project_path = path.join(deployedProjectsPath, messageQueueJob.project_name + messageQueueJob.project_id);
    
    // Check if the project folder exists; if not, create it
    if (!fs.existsSync(project_path)) {
        fs.mkdirSync(project_path);
        console.log(`Created project folder: ${project_path}`);
    } else {
        console.log(`Project folder already exists: ${project_path}`);
    }

    return project_path;
};


export default createProjectFolder;