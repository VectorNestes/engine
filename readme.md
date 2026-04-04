# 🔐 Kubernetes Attack Path Visualizer

A full-stack security analysis engine that models Kubernetes RBAC as a graph and detects attack paths, privilege escalation, and vulnerabilities using graph algorithms.

---

## 🚀 Overview

The Kubernetes Attack Path Visualizer is designed to help security engineers understand how an attacker can move inside a Kubernetes cluster.

It converts Kubernetes resources into a graph structure, enriches it with vulnerability data (CVEs), and applies graph algorithms to detect potential attack paths from entry points to critical assets like secrets and databases.

---

## 🧠 Key Features

### 🔥 Attack Path Detection

* Identifies all possible paths from **entry points → crown jewels**
* Helps visualize how an attacker can compromise sensitive resources

---

### 📊 Risk Scoring System

* Assigns a risk score (0–10) to nodes and paths
* Based on:

  * CVEs
  * RBAC permissions
  * Access to sensitive resources

---

### ⚡ Shortest Attack Path (Dijkstra)

* Finds the most efficient attack route
* Simulates attacker behavior (least resistance path)

---

### 🌐 All Attack Paths (BFS)

* Explores all possible attack routes
* Ensures no hidden vulnerabilities are missed

---

### 💥 Blast Radius Analysis

* Shows how far an attacker can spread from a compromised node
* Helps measure impact of a breach

---

### 🔁 Privilege Escalation Detection

* Detects loops where attacker gains increasing privileges
* Example:

  ```
  Pod → ServiceAccount → Role → Pod (higher privilege)
  ```

---

### 🎯 Critical Node Detection

* Identifies chokepoints in the graph
* Securing these nodes blocks multiple attack paths

---

### 🧪 Attack Simulation

* Simulates removing or securing a node
* Shows:

  * Attack paths eliminated
  * Security improvement %

---

### ⚠️ Vulnerability Analysis

* Lists risky nodes with:

  * CVEs
  * Risk score
  * Explanation of risk

---

### 🧾 Human-Readable Explanations

* Converts technical graph paths into simple attack stories
* Example:

  ```
  Attacker enters via service → accesses pod → uses service account → reads secret
  ```

---

### 📄 Report Generation

* Generates a complete security report including:

  * Attack paths
  * Shortest paths
  * Blast radius
  * Cycles
  * Critical nodes

---

## 🔄 Data Flow

```
Kubernetes Cluster / Mock Data
        ↓
Fetch (kubectl / JSON)
        ↓
Transform → Graph (Nodes + Edges)
        ↓
CVE Enrichment
        ↓
Validation (Zod Schema)
        ↓
cluster-graph.json
        ↓
Graphology
        ↓
GDS Graph Projection
        ↓
Graph Algorithms (BFS, DFS, Dijkstra)
        ↓
API / CLI / Reports
```

---

## 🏗️ Project Architecture

```
src/
│
├── cli/                # CLI commands (scan, ingest, report)
├── core/               # Core logic (fetch, transform, CVE, attack-path)
├── db/                 # Graphology + GDS integration
├── services/           # Business logic (ingestion, reporting)
├── server/             # Express API
├── schemas/            # Validation schemas
├── data/               # Mock dataset
```

---

## 🧪 Technologies Used

* **TypeScript / Node.js**
* **Graphology (Graph Database)**
* **Graphology Graph Data Science (GDS)**
* **Express.js**
* **Zod**
* **Axios**

---

## ⚙️ Installation & Setup

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd project
```

---

### 2. Install dependencies

```bash
npm install
```

---



### 4. Run the project

#### Scan (local pipeline)

```bash
npx ts-node src/cli/index.ts scan --mock
```

#### Full ingestion

```bash
npx ts-node src/cli/index.ts ingest --source mock
```

#### Generate report

```bash
npx ts-node src/cli/index.ts report
```

---

### 5. Start API server

```bash
npx ts-node src/server/server.ts
```

---

## 🌐 API Endpoints

| Endpoint                 | Description        |
| ------------------------ | ------------------ |
| POST /api/ingest         | Run full pipeline  |
| GET /api/graph           | Retrieve graph     |
| GET /api/paths           | Attack paths       |
| GET /api/vulnerabilities | Vulnerable nodes   |
| GET /api/blast-radius    | Reachability       |
| GET /api/cycles          | Privilege cycles   |
| GET /api/critical-node   | Critical nodes     |
| POST /api/simulate       | What-if simulation |
| GET /api/report          | Full report        |

---

## 🎯 Real-World Use Cases

* Kubernetes security auditing
* DevSecOps pipelines
* Threat modeling
* Penetration testing
* Cloud security analysis

---

## 🧠 Interview Explanation

> This project converts Kubernetes RBAC into a graph and uses graph algorithms like BFS, DFS, and Dijkstra to detect attack paths, privilege escalation, and vulnerabilities. It enriches data with CVEs and generates human-readable security reports.

---

## 🚀 Future Improvements

* Frontend graph visualization
* Real-time monitoring
* AI-based risk prediction
* Multi-cluster support

---

## 👨‍💻 Author

**Labyrinth**

---

## ⭐ Final Note

This project demonstrates:

* Graph theory
* System design
* Security analysis
* Backend engineering

A strong real-world project combining **DevOps + Security + Algorithms**.
