#!/usr/bin/env node

import "dotenv/config";
import express from "express";
import bodyParser from "body-parser";
import { AgentLoop } from "./utils/agent/agent-loop.js";
import { loadConfig } from "./utils/config.js";
import { createInputItem } from "./utils/input-utils.js";
import { ReviewDecision } from "./utils/agent/review.js";
import { AutoApprovalMode } from "./utils/auto-approval-mode.js";
import { initLogger } from "./utils/agent/log.js";
import path from "path";

initLogger();

const PORT = process.env.PORT || 3000;
const app = express();

const activeJobs = new Map();

app.use(bodyParser.json());

const config = loadConfig(undefined, undefined, {
  cwd: process.cwd(),
  disableProjectDoc: false
});

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("Missing OpenAI API key. Please set OPENAI_API_KEY environment variable.");
  process.exit(1);
}

const fullConfig = {
  apiKey,
  ...config
};

app.post("/api/jobs", async (req, res) => {
  try {
    const { prompt, model, approvalPolicy, imagePaths = [] } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: "Missing required parameter: prompt" });
    }
    
    const jobId = Date.now().toString();
    
    const logs = [];
    
    const agent = new AgentLoop({
      model: model || fullConfig.model,
      config: fullConfig,
      instructions: fullConfig.instructions,
      approvalPolicy: approvalPolicy || AutoApprovalMode.SUGGEST,
      additionalWritableRoots: [process.cwd()],
      onItem: (item) => {
        const logEntry = { timestamp: new Date().toISOString(), item };
        logs.push(logEntry);
        console.log(JSON.stringify(logEntry));
      },
      onLoading: () => {},
      getCommandConfirmation: (command) => {
        return Promise.resolve({ review: ReviewDecision.YES });
      },
      onLastResponseId: () => {}
    });
    
    activeJobs.set(jobId, { 
      agent,
      logs,
      status: 'running',
      createdAt: new Date()
    });
    
    (async () => {
      try {
        const inputItem = await createInputItem(prompt, imagePaths || []);
        await agent.run([inputItem]);
        activeJobs.get(jobId).status = 'completed';
      } catch (error) {
        console.error(`Job ${jobId} failed:`, error);
        activeJobs.get(jobId).status = 'failed';
        activeJobs.get(jobId).error = error.message;
      }
    })();
    
    res.status(201).json({ 
      jobId,
      status: 'running',
      message: 'Job started successfully'
    });
  } catch (error) {
    console.error("Error starting job:", error);
    res.status(500).json({ error: "Failed to start job" });
  }
});

app.get("/api/jobs/:jobId", (req, res) => {
  const { jobId } = req.params;
  const job = activeJobs.get(jobId);
  
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }
  
  res.json({
    jobId,
    status: job.status,
    createdAt: job.createdAt,
    logs: job.logs
  });
});

app.get("/api/jobs", (req, res) => {
  const jobs = [];
  activeJobs.forEach((job, id) => {
    jobs.push({
      jobId: id,
      status: job.status,
      createdAt: job.createdAt
    });
  });
  
  res.json({ jobs });
});

app.post("/api/jobs/:jobId/cancel", (req, res) => {
  const { jobId } = req.params;
  const job = activeJobs.get(jobId);
  
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }
  
  if (job.status !== 'running') {
    return res.status(400).json({ error: `Job is already ${job.status}` });
  }
  
  try {
    job.agent.cancel();
    job.status = 'cancelled';
    res.json({ jobId, status: 'cancelled' });
  } catch (error) {
    console.error(`Error cancelling job ${jobId}:`, error);
    res.status(500).json({ error: "Failed to cancel job" });
  }
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Codex API server running on port ${PORT}`);
});
