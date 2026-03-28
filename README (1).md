# 🔐 K8s-AV — Kubernetes Attack Path Visualizer

> Turn Kubernetes misconfigurations into real, understandable attack paths.

K8s-AV is a **local-first security analysis tool** that models Kubernetes clusters as graphs and detects how attackers can move from entry points to critical resources like secrets and databases.

---

## 🚀 Project Overview

K8s-AV helps answer the most important security question:

> ❓ *“How can an attacker actually compromise my system?”*

Instead of just listing vulnerabilities, it shows:

- Complete **attack paths**
- **Privilege escalation chains**
- **Critical nodes**
- **Real impact of misconfigurations**

📌 All processing is done locally — no data leaves your system

---

## ❗ Problem It Solves

### Traditional tools:
- Show **hundreds of vulnerabilities**
- No prioritization

### K8s-AV:
- Connects vulnerabilities into **real attack chains**
- Helps prioritize what to fix first

---

## 🧠 Core Features

### 🔍 Cluster Scanning
Extracts:
- Pods, Services, ServiceAccounts
- Roles, RoleBindings
- Secrets, ConfigMaps

Supports:
- Live cluster (`kubectl`)
- Mock dataset

---

### 🔗 Attack Path Detection

Finds paths like:

Entry Point → Pod → ServiceAccount → Role → Secret

Uses:
- BFS (all paths)
- Dijkstra (shortest path)

---

### ⚠️ Vulnerability Analysis
- Adds CVEs from NVD  
- Calculates risk score  
- Highlights exploitable vulnerabilities  

---

### 📊 Graph-Based Analysis
Models cluster as:
- **Nodes** (Pod, Role, Secret)
- **Edges** (permissions, access)

---

### 💥 Blast Radius
- Shows how far attacker can spread from one node

---

### 🔁 Privilege Escalation Detection

Detects loops like:

Pod → ServiceAccount → Role → Pod

Indicates increasing attacker power

---

### 🎯 Critical Node Detection
- Finds nodes that appear in many attack paths  
- Fixing one can stop multiple attacks  

---

### 🧪 Attack Simulation
Simulates removing a node:
- % of attacks reduced  
- Security improvement  

---

### 🧾 Human-Readable Reports

Attacker enters → moves → escalates → accesses secret

---

## 🏗️ Architecture

### High-Level Components

| Layer           | Responsibility              |
|-----------------|-----------------------------|
| CLI             | User commands               |
| Scanner         | Fetch cluster data          |
| Graph Builder   | Convert to graph            |
| Neo4j + GDS     | Graph storage + algorithms  |
| API + UI        | Visualization & reports     |

---

## 🔄 Data Flow

Cluster → Scan → CVE → Graph → Neo4j → Algorithms → API → UI

---

## 📊 Graph Model

### Nodes
- Pod  
- ServiceAccount  
- Role / ClusterRole  
- Secret  
- ConfigMap  
- Service  
- Namespace  

### Edges
- Pod → ServiceAccount  
- ServiceAccount → Role  
- Role → Secret / Pod  
- Service → Pod  

---

## 🧪 Tech Stack

- Node.js (v18+)  
- TypeScript  
- Neo4j (Graph DB)  
- Neo4j GDS (Graph algorithms)  
- Express.js  
- React (UI)  
- Docker  
- kubectl  
- NVD API  

---

## ⚙️ Installation

### Prerequisites
- Node.js ≥ 18  
- Docker  
- kubectl configured  

---

### Run Project

#### 1. Clone
git clone <repo-url>  
cd k8s-av  

#### 2. Install
npm install  

#### 3. Start system
npx k8s-av start  

---

## 🧪 CLI Commands

k8s-av start  
k8s-av scan  
k8s-av ingest  
k8s-av report  

---

## 🔁 Workflow

k8s-av start  
k8s-av ingest --source live  
k8s-av report  

---

## 🎯 Use Cases

- Kubernetes security auditing  
- DevSecOps pipelines  
- Threat modeling  
- Penetration testing  
- Compliance reporting  

---

## 🔐 Security & Privacy

- Local-first architecture  
- No data sent externally  
- Only CVE IDs sent to NVD  
- Requires **read-only access**  

---

## ⚙️ Configuration

NEO4J_URI=bolt://localhost:7687  
NEO4J_USER=neo4j  
NEO4J_PASSWORD=yourpassword  
API_PORT=3001  
UI_PORT=3000  

---

## 🛠️ Troubleshooting

docker ps  
kubectl get pods --all-namespaces  

---

## 🧠 Interview Explanation

“This project models Kubernetes as a graph and uses graph algorithms like BFS and Dijkstra to detect attack paths, privilege escalation, and vulnerabilities.”

---

## 🚀 Future Improvements

- Multi-cluster analysis  
- AI-based risk prediction  
- CI/CD integration  
- Policy recommendations  

---

## 👨‍💻 Author

Vardan Singhal  

---

## 📄 License

MIT License © 2025
