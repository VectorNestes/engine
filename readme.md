# Kubernetes Attack Path Visualizer

A full-stack security analysis engine that models Kubernetes RBAC as a graph and detects attack paths, privilege escalation, and vulnerabilities using graph algorithms.

---

## Overview

The Kubernetes Attack Path Visualizer is designed to help security engineers understand how an attacker can move inside a Kubernetes cluster.

It converts Kubernetes resources into a graph structure, enriches it with vulnerability data (CVEs), and applies graph algorithms to detect potential attack paths from entry points to critical assets like secrets and databases.

---
## Usage

Install it.

```npm i k8s-av```


To run it on a mock cluster 

```npx k8s-av start```

To run it on a cluster terminal

```npx k8s-av start --source live```

For documentation visit https://frontend-seven-steel-14.vercel.app/documentation

Contact Us sudhanshumani94@gmail.com