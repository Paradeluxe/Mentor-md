* * *

## title: Mentor 压力测试文档 (Stress Test) author: Hermes Agent + User date: 2026-06-24 tags: \[test, stress, e2e, markdown, annotations\] description: 一个超长 Markdown 文档,用于 e2e 测试场景覆盖

# Mentor 压力测试文档 (Stress Test Markdown)

> 这是一个用于 Mentor WYSIWYG 编辑器端到端测试的超长 Markdown 文档。文档涵盖了所有常见的 Markdown 元素,包括多级标题、长段落、有序/无序列表、任务列表、表格、数学公式、代码块、行内代码、引用、链接、图片、粗体、斜体、删除线、引用块、嵌套引用、脚注、HTML 内联元素以及特殊字符。

本文档由 Python 脚本自动生成,共包含数百个段落和数十种 Markdown 元素。生成种子 `random.seed(2026)` 以确保可复现性。

## 目录 (Table of Contents)

1.  [第1章:章节 1](#chapter-1)
    
2.  [第2章:章节 2](#chapter-2)
    
3.  [第3章:章节 3](#chapter-3)
    
4.  [第4章:章节 4](#chapter-4)
    
5.  [第5章:章节 5](#chapter-5)
    
6.  [第6章:章节 6](#chapter-6)
    
7.  [第7章:章节 7](#chapter-7)
    
8.  [第8章:章节 8](#chapter-8)
    
9.  [第9章:章节 9](#chapter-9)
    
10.  [第10章:章节 10](#chapter-10)
    
11.  [第11章:章节 11](#chapter-11)
    
12.  [第12章:章节 12](#chapter-12)
    

## 第1章:章节 1 {#chapter-1}

### 1.1 小节 1 - 未来工作

在可解释性方面,我们引入了基于梯度加权的类激活映射(Grad-CAM)技术,对深度学习模型的决策过程进行了可视化分析。这一方法能够有效地揭示模型在进行预测时所关注的关键脑区,从而为神经科学解释提供了直观的依据。

在性能优化方面,我们针对大型文档的渲染做了大量的工作 _(TODO)_。通过虚拟滚动和按需加载技术,即使面对数百页的长文档,系统依然能够保持流畅的交互体验。

Model performance was evaluated on a held-out test set using accuracy, F1-score, and area under the ROC curve (AUC) as the primary metrics.

在某些情况下,我们可以使用如下数学公式来描述这一现象: $E = mc^2$

更多内容请参阅 [KaTeX 数学公式](https://katex.org/)。

### 1.2 小节 2 - 实现细节

然而,我们也观察到了一些与经典理论不完全吻合的现象 _(注意)_。特别是在高负荷条件下,默认模式网络(DMN)的负激活程度出现了明显的下降,这一现象可能反映了注意力资源在不同认知任务之间的动态分配机制。

在性能优化方面,我们针对大型文档的渲染做了大量的工作 _(TODO)_。通过虚拟滚动和按需加载技术,即使面对数百页的长文档,系统依然能够保持流畅的交互体验。

Model performance was evaluated on a held-out test set using accuracy, F1-score, and area under the ROC curve (AUC) as the primary metrics.

1.  需求分析阶段
    
2.  原型设计阶段
    
3.  开发实现阶段
    
4.  测试验证阶段
    
5.  部署上线阶段
    
6.  运维监控阶段
    
7.  迭代优化阶段
    

-   \[x\] 完成需求调研
    
-   \[x\] 制定技术方案
    
-   \[x\] 实现核心功能
    
-   \[ \] 编写单元测试
    
-   \[ \] 性能压力测试
    
-   \[ \] 用户验收测试
    
-   \[ \] 部署上线
    
-   \[ \] 收集用户反馈
    

下面是 `rust` 的示例代码:

```rust
fn main() {
    let numbers: Vec<i32> = (1..=100).collect();
    let sum: i32 = numbers.iter().sum();
    let avg = sum as f64 / numbers.len() as f64;
    println!("Sum: {}, Average: {:.2}", sum, avg);
}
```

### 1.3 小节 3 - 实现细节

本研究采用功能性磁共振成像(fMRI)技术,结合深度学习模型,对受试者在完成工作记忆任务时的脑区激活模式进行了系统性的分析 _(TODO)_。实验设计遵循双盲随机对照原则,确保了研究结果的内部效度。

数据分析过程中,我们严格遵循了多重比较校正的统计学规范。具体而言,我们采用了基于 cluster-level 的 FWE (family-wise error) 校正方法,并以 p < 0.05 作为显著性阈值。

> The only way to do great work is to love what you do. — Steve Jobs

### 1.4 小节 4 - 理论框架

Functional connectivity was estimated using the Pearson correlation coefficient between the mean BOLD signals of predefined regions of interest (ROIs) from the AAL atlas.

在交互设计上,我们借鉴了 Microsoft Word 成熟的批注使用体验,同时针对 Markdown 编辑的特点进行了适配。用户可以通过选区拖拽来精确指定批注的覆盖范围,系统会自动记录其字符偏移位置。

在交互设计上,我们借鉴了 Microsoft Word 成熟的批注使用体验,同时针对 Markdown 编辑的特点进行了适配。用户可以通过选区拖拽来精确指定批注的覆盖范围,系统会自动记录其字符偏移位置。

-   \[x\] 完成需求调研
    
-   \[x\] 制定技术方案
    
-   \[x\] 实现核心功能
    
-   \[ \] 编写单元测试
    
-   \[ \] 性能压力测试
    
-   \[ \] 用户验收测试
    
-   \[ \] 部署上线
    
-   \[ \] 收集用户反馈
    

## 第2章:章节 2 {#chapter-2}

### 2.1 小节 1 - 性能评估

The source code and analysis scripts are publicly available on GitHub to facilitate reproducibility and encourage further research in this direction.

批注系统的核心设计原则是确保源文档的完整性与可读性。我们采用侧车文件(Sidecar File)的存储模式,将所有批注信息存储在独立的 JSON 文件中,从而避免了将批注元数据污染原始 Markdown 内容的风险。

在某些情况下,我们可以使用如下数学公式来描述这一现象: $\hat{H}\Psi = E\Psi$

> The important thing is not to stop questioning. Curiosity has its own reason for existing. — Albert Einstein

### 2.2 小节 2 - 性能评估

然而,我们也观察到了一些与经典理论不完全吻合的现象。特别是在高负荷条件下,默认模式网络(DMN)的负激活程度出现了明显的下降,这一现象可能反映了注意力资源在不同认知任务之间的动态分配机制。 这里使用了 `annotation` 这样的行内代码。

Training was performed using the Adam optimizer with an initial learning rate of 1e-3 and a cosine annealing schedule over 100 epochs.

更多内容请参阅 [KaTeX 数学公式](https://katex.org/)。

### 2.3 小节 3 - 性能评估

本研究的一个潜在局限性在于样本规模相对有限,这在一定程度上限制了研究结果的统计效力和外部效度。未来的研究可以通过多中心合作的方式扩大样本量,以进一步验证我们发现的稳健性。 这里使用了 `annotation` 这样的行内代码。

批注的状态管理采用了三态模型:开放(Open)、已解决(Resolved)、已删除(Deleted)。这种设计既保留了历史记录,又能够让用户在需要时方便地回顾之前的讨论内容。

在某些情况下,我们可以使用如下数学公式来描述这一现象: $\nabla \cdot \vec{E} = \frac{\rho}{\varepsilon_0}$

| 字段1 | 字段2 | 字段3 | 字段4 |
| --- | --- | --- | --- |
| 值11 | 值12 | 值13 | 值14 |
| 值21 | 值22 | 值23 | 值24 |
| 值31 | 值32 | 值33 | 值34 |
| 值41 | 值42 | 值43 | 值44 |

### 2.4 小节 4 - 用户研究

We hope this work will inspire further investigations into the intersection of artificial intelligence and cognitive neuroscience.

从方法论的角度来看,我们提出了一种基于图卷积网络(GCN)的脑网络分析方法 _(重要)_。该方法能够有效地捕捉脑区之间的功能连接模式,并将其映射到一个高维嵌入空间中。这种表征学习的方式为后续的分类和聚类任务提供了强有力的特征基础。

实验结果表明,在工作记忆任务的 n-back 范式下,前额叶皮层和顶叶网络的协同激活与任务难度呈现出显著的正相关关系。这一发现与以往的研究结果高度一致,进一步验证了我们方法的有效性。

1.  需求分析阶段
    
2.  原型设计阶段
    
3.  开发实现阶段
    
4.  测试验证阶段
    
5.  部署上线阶段
    
6.  运维监控阶段
    
7.  迭代优化阶段
    

### 2.5 小节 5 - 性能评估

Training was performed using the Adam optimizer with an initial learning rate of 1e-3 and a cosine annealing schedule over 100 epochs.

在某些情况下,我们可以使用如下数学公式来描述这一现象: $\sum_{i=1}^{n} i = \frac{n(n+1)}{2}$

| 字段1 | 字段2 | 字段3 | 字段4 |
| --- | --- | --- | --- |
| 值11 | 值12 | 值13 | 值14 |
| 值21 | 值22 | 值23 | 值24 |
| 值31 | 值32 | 值33 | 值34 |
| 值41 | 值42 | 值43 | 值44 |
| 值51 | 值52 | 值53 | 值54 |
| 值61 | 值62 | 值63 | 值64 |
| 值71 | 值72 | 值73 | 值74 |

### 2.6 小节 6 - 数据分析

嵌套回复是本系统的另一大特色功能,它允许审阅者之间就同一选区展开多轮讨论 _(重要)_。这种对话式的批注模式特别适合学术论文的同行评审场景,能够显著提升协作效率。

数据分析过程中,我们严格遵循了多重比较校正的统计学规范。具体而言,我们采用了基于 cluster-level 的 FWE (family-wise error) 校正方法,并以 p < 0.05 作为显著性阈值。 这里使用了 `Tiptap` 这样的行内代码。

The source code and analysis scripts are publicly available on GitHub to facilitate reproducibility and encourage further research in this direction. 这里使用了 `annotation` 这样的行内代码。

1.  需求分析阶段
    
2.  原型设计阶段
    
3.  开发实现阶段
    
4.  测试验证阶段
    
5.  部署上线阶段
    
6.  运维监控阶段
    
7.  迭代优化阶段
    

| 字段1 | 字段2 | 字段3 | 字段4 | 字段5 |
| --- | --- | --- | --- | --- |
| 值11 | 值12 | 值13 | 值14 | 值15 |
| 值21 | 值22 | 值23 | 值24 | 值25 |
| 值31 | 值32 | 值33 | 值34 | 值35 |
| 值41 | 值42 | 值43 | 值44 | 值45 |
| 值51 | 值52 | 值53 | 值54 | 值55 |
| 值61 | 值62 | 值63 | 值64 | 值65 |
| 值71 | 值72 | 值73 | 值74 | 值75 |
| 值81 | 值82 | 值83 | 值84 | 值85 |

## 第3章:章节 3 {#chapter-3}

### 3.1 小节 1 - 相关工作

然而,我们也观察到了一些与经典理论不完全吻合的现象。特别是在高负荷条件下,默认模式网络(DMN)的负激活程度出现了明显的下降,这一现象可能反映了注意力资源在不同认知任务之间的动态分配机制。 这里使用了 `WYSIWYG` 这样的行内代码。

在可解释性方面,我们引入了基于梯度加权的类激活映射(Grad-CAM)技术,对深度学习模型的决策过程进行了可视化分析 _(关键)_。这一方法能够有效地揭示模型在进行预测时所关注的关键脑区,从而为神经科学解释提供了直观的依据。

The dataset comprises 128 healthy adults recruited from the local community. All participants provided informed consent in accordance with the Declaration of Helsinki and the institutional review board.

-   \[x\] 完成需求调研
    
-   \[x\] 制定技术方案
    
-   \[x\] 实现核心功能
    
-   \[ \] 编写单元测试
    
-   \[ \] 性能压力测试
    
-   \[ \] 用户验收测试
    
-   \[ \] 部署上线
    
-   \[ \] 收集用户反馈
    

在某些情况下,我们可以使用如下数学公式来描述这一现象: $\nabla \cdot \vec{E} = \frac{\rho}{\varepsilon_0}$

| 字段1 | 字段2 | 字段3 | 字段4 |
| --- | --- | --- | --- |
| 值11 | 值12 | 值13 | 值14 |
| 值21 | 值22 | 值23 | 值24 |
| 值31 | 值32 | 值33 | 值34 |
| 值41 | 值42 | 值43 | 值44 |
| 值51 | 值52 | 值53 | 值54 |

### 3.2 小节 2 - 局限性

在可解释性方面,我们引入了基于梯度加权的类激活映射(Grad-CAM)技术,对深度学习模型的决策过程进行了可视化分析。这一方法能够有效地揭示模型在进行预测时所关注的关键脑区,从而为神经科学解释提供了直观的依据。 这里使用了 `Tiptap` 这样的行内代码。

值得注意的是,个体差异在神经影像数据分析中扮演着至关重要的角色 _(注意)_。即使是同质性较高的受试者群体,其脑区激活模式仍可能存在显著的个体间变异。这种变异既可能源于遗传因素,也可能反映了个体生活经历和学习经验的累积效应。

在某些情况下,我们可以使用如下数学公式来描述这一现象: $\sum_{i=1}^{n} i = \frac{n(n+1)}{2}$

> The only way to do great work is to love what you do. — Steve Jobs

### 3.3 小节 3 - 局限性

In summary, our findings contribute to a growing body of evidence supporting the utility of graph-based deep learning for neuroimaging analysis.

在某些情况下,我们可以使用如下数学公式来描述这一现象: $\sum_{i=1}^{n} i = \frac{n(n+1)}{2}$

下面是 `yaml` 的示例代码:

```yaml
name: Mentor Stress Test
version: 1.0.0
description: Long markdown for e2e pressure testing
authors:
  - Hermes Agent
  - User
config:
  viewport: 1440x900
  timeout: 30000
  retries: 3
environments:
  - dev
  - staging
  - production
```

### 3.4 小节 4 - 性能评估

本研究采用功能性磁共振成像(fMRI)技术,结合深度学习模型,对受试者在完成工作记忆任务时的脑区激活模式进行了系统性的分析。实验设计遵循双盲随机对照原则,确保了研究结果的内部效度。 这里使用了 `KaTeX` 这样的行内代码。

更多内容请参阅 [GitHub Pages](https://pages.github.com/)。

下面是 `sql` 的示例代码:

```sql
SELECT user_id, COUNT(*) AS annotation_count
FROM annotations
WHERE created_at >= '2026-01-01'
GROUP BY user_id
HAVING COUNT(*) > 10
ORDER BY annotation_count DESC
LIMIT 50;
```

| 字段1 | 字段2 | 字段3 | 字段4 |
| --- | --- | --- | --- |
| 值11 | 值12 | 值13 | 值14 |
| 值21 | 值22 | 值23 | 值24 |
| 值31 | 值32 | 值33 | 值34 |
| 值41 | 值42 | 值43 | 值44 |

### 3.5 小节 5 - 数据分析

批注系统的核心设计原则是确保源文档的完整性与可读性 _(注意)_。我们采用侧车文件(Sidecar File)的存储模式,将所有批注信息存储在独立的 JSON 文件中,从而避免了将批注元数据污染原始 Markdown 内容的风险。 这里使用了 `WYSIWYG` 这样的行内代码。

We employed a sliding window approach with a window length of 30 TRs and a step size of 1 TR to capture the dynamic nature of functional connectivity patterns. 这里使用了 `Tiptap` 这样的行内代码。

本研究采用功能性磁共振成像(fMRI)技术,结合深度学习模型,对受试者在完成工作记忆任务时的脑区激活模式进行了系统性的分析 _(注意)_。实验设计遵循双盲随机对照原则,确保了研究结果的内部效度。

-   第一项:用户界面设计应当遵循一致性原则
    
-   第二项:响应式布局需要考虑多终端适配
    
-   第三项:无障碍访问是基本要求
    
-   第四项:性能优化贯穿整个开发周期
    
-   第五项:代码可维护性决定项目寿命
    
-   \[x\] Set up CI/CD pipeline
    
-   \[x\] Configure monitoring
    
-   \[ \] Write API documentation
    
-   \[ \] Conduct security audit
    
-   \[ \] Optimize database queries
    
-   \[ \] Implement caching layer
    

在某些情况下,我们可以使用如下数学公式来描述这一现象: $P(A|B) = \frac{P(B|A) \cdot P(A)}{P(B)}$

> The only way to do great work is to love what you do. — Steve Jobs

## 第4章:章节 4 {#chapter-4}

### 4.1 小节 1 - 未来工作

从方法论的角度来看,我们提出了一种基于图卷积网络(GCN)的脑网络分析方法。该方法能够有效地捕捉脑区之间的功能连接模式,并将其映射到一个高维嵌入空间中。这种表征学习的方式为后续的分类和聚类任务提供了强有力的特征基础。

The source code and analysis scripts are publicly available on GitHub to facilitate reproducibility and encourage further research in this direction.

批注的状态管理采用了三态模型:开放(Open)、已解决(Resolved)、已删除(Deleted)。这种设计既保留了历史记录,又能够让用户在需要时方便地回顾之前的讨论内容。

1.  需求分析阶段
    
2.  原型设计阶段
    
3.  开发实现阶段
    
4.  测试验证阶段
    
5.  部署上线阶段
    
6.  运维监控阶段
    
7.  迭代优化阶段
    

在某些情况下,我们可以使用如下数学公式来描述这一现象: $\mathcal{L} = -\frac{1}{N}\sum_{i=1}^{N} y_i \log(\hat{y}_i)$

更多内容请参阅 [Obsidian](https://obsidian.md/)。

下面是 `json` 的示例代码:

```json
{
  "name": "mentor-stress-test",
  "version": "2.0.0",
  "dependencies": {
    "tiptap": "^2.1.0",
    "katex": "^0.16.0",
    "turndown": "^7.1.0"
  },
  "scripts": {
    "start": "python3 -m http.server 8080",
    "test": "playwright test"
  }
}
```

### 4.2 小节 2 - 实验方法

嵌套回复是本系统的另一大特色功能,它允许审阅者之间就同一选区展开多轮讨论。这种对话式的批注模式特别适合学术论文的同行评审场景,能够显著提升协作效率。

Recent advances in neuroimaging have enabled unprecedented insights into the functional architecture of the human brain. In this study, we leverage these advances to investigate the neural correlates of cognitive control.

在某些情况下,我们可以使用如下数学公式来描述这一现象: $\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}$

> The important thing is not to stop questioning. Curiosity has its own reason for existing. — Albert Einstein

### 4.3 小节 3 - 局限性

数据分析过程中,我们严格遵循了多重比较校正的统计学规范。具体而言,我们采用了基于 cluster-level 的 FWE (family-wise error) 校正方法,并以 p < 0.05 作为显著性阈值。

-   第一项:用户界面设计应当遵循一致性原则
    
-   第二项:响应式布局需要考虑多终端适配
    
-   第三项:无障碍访问是基本要求
    
-   第四项:性能优化贯穿整个开发周期
    
-   第五项:代码可维护性决定项目寿命
    

更多内容请参阅 [Tiptap 官方文档](https://tiptap.dev/docs)。

### 4.4 小节 4 - 性能评估

在性能优化方面,我们针对大型文档的渲染做了大量的工作 _(关键)_。通过虚拟滚动和按需加载技术,即使面对数百页的长文档,系统依然能够保持流畅的交互体验。 这里使用了 `WYSIWYG` 这样的行内代码。

We employed a sliding window approach with a window length of 30 TRs and a step size of 1 TR to capture the dynamic nature of functional connectivity patterns.

-   \[x\] 完成需求调研
    
-   \[x\] 制定技术方案
    
-   \[x\] 实现核心功能
    
-   \[ \] 编写单元测试
    
-   \[ \] 性能压力测试
    
-   \[ \] 用户验收测试
    
-   \[ \] 部署上线
    
-   \[ \] 收集用户反馈
    

### 4.5 小节 5 - 局限性

批注系统的核心设计原则是确保源文档的完整性与可读性。我们采用侧车文件(Sidecar File)的存储模式,将所有批注信息存储在独立的 JSON 文件中,从而避免了将批注元数据污染原始 Markdown 内容的风险。

在过去的十年中,认知神经科学的研究范式经历了从行为学到计算建模、再到大规模神经影像数据分析的深刻转变。这一转变的核心驱动力来自于多模态脑成像技术的飞速发展,以及开源数据分析工具的广泛普及。 这里使用了 `ProseMirror` 这样的行内代码。

### 4.6 小节 6 - 未来工作

Model performance was evaluated on a held-out test set using accuracy, F1-score, and area under the ROC curve (AUC) as the primary metrics.

1.  需求分析阶段
    
2.  原型设计阶段
    
3.  开发实现阶段
    
4.  测试验证阶段
    
5.  部署上线阶段
    
6.  运维监控阶段
    
7.  迭代优化阶段
    

在某些情况下,我们可以使用如下数学公式来描述这一现象: $f(x) = \frac{1}{\sqrt{2\pi\sigma^2}} e^{-\frac{(x-\mu)^2}{2\sigma^2}}$

下面是 `javascript` 的示例代码:

```javascript
function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

const log = debounce(console.log, 300);
log("hello");
log("world");
```

### 4.7 小节 7 - 数据分析

在性能优化方面,我们针对大型文档的渲染做了大量的工作 _(注意)_。通过虚拟滚动和按需加载技术,即使面对数百页的长文档,系统依然能够保持流畅的交互体验。

批注的状态管理采用了三态模型:开放(Open)、已解决(Resolved)、已删除(Deleted)。这种设计既保留了历史记录,又能够让用户在需要时方便地回顾之前的讨论内容。

-   第一项:用户界面设计应当遵循一致性原则
    
-   第二项:响应式布局需要考虑多终端适配
    
-   第三项:无障碍访问是基本要求
    
-   第四项:性能优化贯穿整个开发周期
    
-   第五项:代码可维护性决定项目寿命
    
-   \[x\] Set up CI/CD pipeline
    
-   \[x\] Configure monitoring
    
-   \[ \] Write API documentation
    
-   \[ \] Conduct security audit
    
-   \[ \] Optimize database queries
    
-   \[ \] Implement caching layer
    

> Stay hungry, stay foolish. — Steve Jobs

| 字段1 | 字段2 | 字段3 | 字段4 | 字段5 |
| --- | --- | --- | --- | --- |
| 值11 | 值12 | 值13 | 值14 | 值15 |
| 值21 | 值22 | 值23 | 值24 | 值25 |
| 值31 | 值32 | 值33 | 值34 | 值35 |
| 值41 | 值42 | 值43 | 值44 | 值45 |
| 值51 | 值52 | 值53 | 值54 | 值55 |

## 第5章:章节 5 {#chapter-5}

### 5.1 小节 1 - 用户研究

The proposed graph neural network architecture comprises three graph attention layers, each followed by batch normalization and a dropout layer with p=0.5.

-   第一项:用户界面设计应当遵循一致性原则
    
-   第二项:响应式布局需要考虑多终端适配
    
-   第三项:无障碍访问是基本要求
    
-   第四项:性能优化贯穿整个开发周期
    
-   第五项:代码可维护性决定项目寿命
    

在某些情况下,我们可以使用如下数学公式来描述这一现象: $\hat{H}\Psi = E\Psi$

> Stay hungry, stay foolish. — Steve Jobs

| 字段1 | 字段2 | 字段3 | 字段4 |
| --- | --- | --- | --- |
| 值11 | 值12 | 值13 | 值14 |
| 值21 | 值22 | 值23 | 值24 |
| 值31 | 值32 | 值33 | 值34 |
| 值41 | 值42 | 值43 | 值44 |
| 值51 | 值52 | 值53 | 值54 |
| 值61 | 值62 | 值63 | 值64 |

### 5.2 小节 2 - 性能评估

然而,我们也观察到了一些与经典理论不完全吻合的现象 _(TODO)_。特别是在高负荷条件下,默认模式网络(DMN)的负激活程度出现了明显的下降,这一现象可能反映了注意力资源在不同认知任务之间的动态分配机制。 这里使用了 `WYSIWYG` 这样的行内代码。

批注的状态管理采用了三态模型:开放(Open)、已解决(Resolved)、已删除(Deleted)。这种设计既保留了历史记录,又能够让用户在需要时方便地回顾之前的讨论内容。

下面是 `yaml` 的示例代码:

```yaml
name: Mentor Stress Test
version: 1.0.0
description: Long markdown for e2e pressure testing
authors:
  - Hermes Agent
  - User
config:
  viewport: 1440x900
  timeout: 30000
  retries: 3
environments:
  - dev
  - staging
  - production
```

| 字段1 | 字段2 | 字段3 | 字段4 | 字段5 |
| --- | --- | --- | --- | --- |
| 值11 | 值12 | 值13 | 值14 | 值15 |
| 值21 | 值22 | 值23 | 值24 | 值25 |
| 值31 | 值32 | 值33 | 值34 | 值35 |
| 值41 | 值42 | 值43 | 值44 | 值45 |
| 值51 | 值52 | 值53 | 值54 | 值55 |
| 值61 | 值62 | 值63 | 值64 | 值65 |

### 5.3 小节 3 - 数据分析

Recent advances in neuroimaging have enabled unprecedented insights into the functional architecture of the human brain. In this study, we leverage these advances to investigate the neural correlates of cognitive control.

在某些情况下,我们可以使用如下数学公式来描述这一现象: $P(A|B) = \frac{P(B|A) \cdot P(A)}{P(B)}$

> 在科学上没有平坦的大道,只有不畏劳苦沿着陡峭山路攀登的人,才有希望达到光辉的顶点。 — 马克思

更多内容请参阅 [ProseMirror 参考](https://prosemirror.net/)。

| 字段1 | 字段2 | 字段3 | 字段4 |
| --- | --- | --- | --- |
| 值11 | 值12 | 值13 | 值14 |
| 值21 | 值22 | 值23 | 值24 |
| 值31 | 值32 | 值33 | 值34 |
| 值41 | 值42 | 值43 | 值44 |

### 5.4 小节 4 - 实现细节

批注的状态管理采用了三态模型:开放(Open)、已解决(Resolved)、已删除(Deleted)。这种设计既保留了历史记录,又能够让用户在需要时方便地回顾之前的讨论内容。 这里使用了 `Tiptap` 这样的行内代码。

在某些情况下,我们可以使用如下数学公式来描述这一现象: $f(x) = \frac{1}{\sqrt{2\pi\sigma^2}} e^{-\frac{(x-\mu)^2}{2\sigma^2}}$

> 想象力比知识更重要,因为知识是有限的,而想象力概括着世界上的一切。 — 爱因斯坦

更多内容请参阅 [Obsidian](https://obsidian.md/)。

### 5.5 小节 5 - 用户研究

本研究采用功能性磁共振成像(fMRI)技术,结合深度学习模型,对受试者在完成工作记忆任务时的脑区激活模式进行了系统性的分析 _(重要)_。实验设计遵循双盲随机对照原则,确保了研究结果的内部效度。

Limitations of the current study include the relatively modest sample size and the cross-sectional nature of the data, which precludes causal inference. 这里使用了 `annotation` 这样的行内代码。

-   \[x\] Set up CI/CD pipeline
    
-   \[x\] Configure monitoring
    
-   \[ \] Write API documentation
    
-   \[ \] Conduct security audit
    
-   \[ \] Optimize database queries
    
-   \[ \] Implement caching layer
    

在某些情况下,我们可以使用如下数学公式来描述这一现象: $\sum_{i=1}^{n} i = \frac{n(n+1)}{2}$

> The only way to do great work is to love what you do. — Steve Jobs

更多内容请参阅 [Obsidian](https://obsidian.md/)。

### 5.6 小节 6 - 用户研究

从方法论的角度来看,我们提出了一种基于图卷积网络(GCN)的脑网络分析方法 _(关键)_。该方法能够有效地捕捉脑区之间的功能连接模式,并将其映射到一个高维嵌入空间中。这种表征学习的方式为后续的分类和聚类任务提供了强有力的特征基础。

然而,我们也观察到了一些与经典理论不完全吻合的现象。特别是在高负荷条件下,默认模式网络(DMN)的负激活程度出现了明显的下降,这一现象可能反映了注意力资源在不同认知任务之间的动态分配机制。

在某些情况下,我们可以使用如下数学公式来描述这一现象: $\hat{H}\Psi = E\Psi$

> The important thing is not to stop questioning. Curiosity has its own reason for existing. — Albert Einstein

下面是 `bash` 的示例代码:

```bash
#!/bin/bash
# Backup script for Mentor project
SRC="/mnt/e/hermes_playground/Mentor"
DST="/mnt/e/backups/Mentor-$(date +%Y%m%d)"
mkdir -p "$DST"
rsync -avz --exclude="node_modules" "$SRC/" "$DST/"
echo "Backup complete: $DST"
```

## 第6章:章节 6 {#chapter-6}

### 6.1 小节 1 - 相关工作

Model performance was evaluated on a held-out test set using accuracy, F1-score, and area under the ROC curve (AUC) as the primary metrics.

1.  需求分析阶段
    
2.  原型设计阶段
    
3.  开发实现阶段
    
4.  测试验证阶段
    
5.  部署上线阶段
    
6.  运维监控阶段
    
7.  迭代优化阶段
    

| 字段1 | 字段2 | 字段3 | 字段4 | 字段5 |
| --- | --- | --- | --- | --- |
| 值11 | 值12 | 值13 | 值14 | 值15 |
| 值21 | 值22 | 值23 | 值24 | 值25 |
| 值31 | 值32 | 值33 | 值34 | 值35 |
| 值41 | 值42 | 值43 | 值44 | 值45 |
| 值51 | 值52 | 值53 | 值54 | 值55 |
| 值61 | 值62 | 值63 | 值64 | 值65 |

### 6.2 小节 2 - 未来工作

在性能优化方面,我们针对大型文档的渲染做了大量的工作 _(关键)_。通过虚拟滚动和按需加载技术,即使面对数百页的长文档,系统依然能够保持流畅的交互体验。 这里使用了 `KaTeX` 这样的行内代码。

-   \[x\] Set up CI/CD pipeline
    
-   \[x\] Configure monitoring
    
-   \[ \] Write API documentation
    
-   \[ \] Conduct security audit
    
-   \[ \] Optimize database queries
    
-   \[ \] Implement caching layer
    

| 字段1 | 字段2 | 字段3 | 字段4 | 字段5 |
| --- | --- | --- | --- | --- |
| 值11 | 值12 | 值13 | 值14 | 值15 |
| 值21 | 值22 | 值23 | 值24 | 值25 |
| 值31 | 值32 | 值33 | 值34 | 值35 |
| 值41 | 值42 | 值43 | 值44 | 值45 |
| 值51 | 值52 | 值53 | 值54 | 值55 |

### 6.3 小节 3 - 实验方法

批注的状态管理采用了三态模型:开放(Open)、已解决(Resolved)、已删除(Deleted)。这种设计既保留了历史记录,又能够让用户在需要时方便地回顾之前的讨论内容。

Limitations of the current study include the relatively modest sample size and the cross-sectional nature of the data, which precludes causal inference.

总体而言,本研究为理解工作记忆的神经机制提供了新的证据,并展示了深度学习技术在神经影像数据分析中的巨大潜力。我们相信,随着算法和算力的持续进步,这一领域将迎来更加激动人心的发展。 这里使用了 `ProseMirror` 这样的行内代码。

-   \[x\] 完成需求调研
    
-   \[x\] 制定技术方案
    
-   \[x\] 实现核心功能
    
-   \[ \] 编写单元测试
    
-   \[ \] 性能压力测试
    
-   \[ \] 用户验收测试
    
-   \[ \] 部署上线
    
-   \[ \] 收集用户反馈
    

在某些情况下,我们可以使用如下数学公式来描述这一现象: $\nabla \cdot \vec{E} = \frac{\rho}{\varepsilon_0}$

更多内容请参阅 [ProseMirror 参考](https://prosemirror.net/)。

| 字段1 | 字段2 | 字段3 | 字段4 | 字段5 |
| --- | --- | --- | --- | --- |
| 值11 | 值12 | 值13 | 值14 | 值15 |
| 值21 | 值22 | 值23 | 值24 | 值25 |
| 值31 | 值32 | 值33 | 值34 | 值35 |
| 值41 | 值42 | 值43 | 值44 | 值45 |
| 值51 | 值52 | 值53 | 值54 | 值55 |
| 值61 | 值62 | 值63 | 值64 | 值65 |
| 值71 | 值72 | 值73 | 值74 | 值75 |

### 6.4 小节 4 - 性能评估

总体而言,本研究为理解工作记忆的神经机制提供了新的证据,并展示了深度学习技术在神经影像数据分析中的巨大潜力。我们相信,随着算法和算力的持续进步,这一领域将迎来更加激动人心的发展。 这里使用了 `Tiptap` 这样的行内代码。

The proposed graph neural network architecture comprises three graph attention layers, each followed by batch normalization and a dropout layer with p=0.5.

在性能优化方面,我们针对大型文档的渲染做了大量的工作。通过虚拟滚动和按需加载技术,即使面对数百页的长文档,系统依然能够保持流畅的交互体验。

1.  需求分析阶段
    
2.  原型设计阶段
    
3.  开发实现阶段
    
4.  测试验证阶段
    
5.  部署上线阶段
    
6.  运维监控阶段
    
7.  迭代优化阶段
    

在某些情况下,我们可以使用如下数学公式来描述这一现象: $P(A|B) = \frac{P(B|A) \cdot P(A)}{P(B)}$

更多内容请参阅 [MDN Web Docs](https://developer.mozilla.org/)。

下面是 `sql` 的示例代码:

```sql
SELECT user_id, COUNT(*) AS annotation_count
FROM annotations
WHERE created_at >= '2026-01-01'
GROUP BY user_id
HAVING COUNT(*) > 10
ORDER BY annotation_count DESC
LIMIT 50;
```

### 6.5 小节 5 - 局限性

从方法论的角度来看,我们提出了一种基于图卷积网络(GCN)的脑网络分析方法 _(TODO)_。该方法能够有效地捕捉脑区之间的功能连接模式,并将其映射到一个高维嵌入空间中。这种表征学习的方式为后续的分类和聚类任务提供了强有力的特征基础。

All experiments were conducted on a workstation equipped with an NVIDIA RTX 4090 GPU and 64GB of system memory. The total training time was approximately 6 hours.

### 6.6 小节 6 - 性能评估

总体而言,本研究为理解工作记忆的神经机制提供了新的证据,并展示了深度学习技术在神经影像数据分析中的巨大潜力 _(注意)_。我们相信,随着算法和算力的持续进步,这一领域将迎来更加激动人心的发展。

然而,我们也观察到了一些与经典理论不完全吻合的现象 _(关键)_。特别是在高负荷条件下,默认模式网络(DMN)的负激活程度出现了明显的下降,这一现象可能反映了注意力资源在不同认知任务之间的动态分配机制。

In summary, our findings contribute to a growing body of evidence supporting the utility of graph-based deep learning for neuroimaging analysis.

> The important thing is not to stop questioning. Curiosity has its own reason for existing. — Albert Einstein

更多内容请参阅 [ProseMirror 参考](https://prosemirror.net/)。

### 6.7 小节 7 - 局限性

本研究的一个潜在局限性在于样本规模相对有限,这在一定程度上限制了研究结果的统计效力和外部效度 _(注意)_。未来的研究可以通过多中心合作的方式扩大样本量,以进一步验证我们发现的稳健性。

批注系统的核心设计原则是确保源文档的完整性与可读性 _(关键)_。我们采用侧车文件(Sidecar File)的存储模式,将所有批注信息存储在独立的 JSON 文件中,从而避免了将批注元数据污染原始 Markdown 内容的风险。 这里使用了 `KaTeX` 这样的行内代码。

Future work will explore the application of transformer-based architectures to capture long-range dependencies in brain network dynamics.

-   第一项:用户界面设计应当遵循一致性原则
    
-   第二项:响应式布局需要考虑多终端适配
    
-   第三项:无障碍访问是基本要求
    
-   第四项:性能优化贯穿整个开发周期
    
-   第五项:代码可维护性决定项目寿命
    

> 在科学上没有平坦的大道,只有不畏劳苦沿着陡峭山路攀登的人,才有希望达到光辉的顶点。 — 马克思

下面是 `bash` 的示例代码:

```bash
#!/bin/bash
# Backup script for Mentor project
SRC="/mnt/e/hermes_playground/Mentor"
DST="/mnt/e/backups/Mentor-$(date +%Y%m%d)"
mkdir -p "$DST"
rsync -avz --exclude="node_modules" "$SRC/" "$DST/"
echo "Backup complete: $DST"
```

## 第7章:章节 7 {#chapter-7}

### 7.1 小节 1 - 数据分析

值得注意的是,个体差异在神经影像数据分析中扮演着至关重要的角色 _(重要)_。即使是同质性较高的受试者群体,其脑区激活模式仍可能存在显著的个体间变异。这种变异既可能源于遗传因素,也可能反映了个体生活经历和学习经验的累积效应。

批注系统的核心设计原则是确保源文档的完整性与可读性 _(TODO)_。我们采用侧车文件(Sidecar File)的存储模式,将所有批注信息存储在独立的 JSON 文件中,从而避免了将批注元数据污染原始 Markdown 内容的风险。

-   \[x\] Set up CI/CD pipeline
    
-   \[x\] Configure monitoring
    
-   \[ \] Write API documentation
    
-   \[ \] Conduct security audit
    
-   \[ \] Optimize database queries
    
-   \[ \] Implement caching layer
    

> Stay hungry, stay foolish. — Steve Jobs

下面是 `bash` 的示例代码:

```bash
#!/bin/bash
# Backup script for Mentor project
SRC="/mnt/e/hermes_playground/Mentor"
DST="/mnt/e/backups/Mentor-$(date +%Y%m%d)"
mkdir -p "$DST"
rsync -avz --exclude="node_modules" "$SRC/" "$DST/"
echo "Backup complete: $DST"
```

| 字段1 | 字段2 | 字段3 |
| --- | --- | --- |
| 值11 | 值12 | 值13 |
| 值21 | 值22 | 值23 |
| 值31 | 值32 | 值33 |
| 值41 | 值42 | 值43 |
| 值51 | 值52 | 值53 |
| 值61 | 值62 | 值63 |
| 值71 | 值72 | 值73 |
| 值81 | 值82 | 值83 |

### 7.2 小节 2 - 实现细节

Recent advances in neuroimaging have enabled unprecedented insights into the functional architecture of the human brain. In this study, we leverage these advances to investigate the neural correlates of cognitive control.

-   第一项:用户界面设计应当遵循一致性原则
    
-   第二项:响应式布局需要考虑多终端适配
    
-   第三项:无障碍访问是基本要求
    
-   第四项:性能优化贯穿整个开发周期
    
-   第五项:代码可维护性决定项目寿命
    

在某些情况下,我们可以使用如下数学公式来描述这一现象: $\mathcal{L} = -\frac{1}{N}\sum_{i=1}^{N} y_i \log(\hat{y}_i)$

> The important thing is not to stop questioning. Curiosity has its own reason for existing. — Albert Einstein

更多内容请参阅 [MDN Web Docs](https://developer.mozilla.org/)。

下面是 `javascript` 的示例代码:

```javascript
function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

const log = debounce(console.log, 300);
log("hello");
log("world");
```

### 7.3 小节 3 - 相关工作

数据分析过程中,我们严格遵循了多重比较校正的统计学规范。具体而言,我们采用了基于 cluster-level 的 FWE (family-wise error) 校正方法,并以 p < 0.05 作为显著性阈值。

从方法论的角度来看,我们提出了一种基于图卷积网络(GCN)的脑网络分析方法。该方法能够有效地捕捉脑区之间的功能连接模式,并将其映射到一个高维嵌入空间中。这种表征学习的方式为后续的分类和聚类任务提供了强有力的特征基础。

Training was performed using the Adam optimizer with an initial learning rate of 1e-3 and a cosine annealing schedule over 100 epochs.

在某些情况下,我们可以使用如下数学公式来描述这一现象: $\nabla \cdot \vec{E} = \frac{\rho}{\varepsilon_0}$

> 科学是没有国界的,因为它属于全人类的财富,是照亮世界的火炬。 — 巴斯德

### 7.4 小节 4 - 实验方法

从方法论的角度来看,我们提出了一种基于图卷积网络(GCN)的脑网络分析方法。该方法能够有效地捕捉脑区之间的功能连接模式,并将其映射到一个高维嵌入空间中。这种表征学习的方式为后续的分类和聚类任务提供了强有力的特征基础。 这里使用了 `annotation` 这样的行内代码。

-   第一项:用户界面设计应当遵循一致性原则
    
-   第二项:响应式布局需要考虑多终端适配
    
-   第三项:无障碍访问是基本要求
    
-   第四项:性能优化贯穿整个开发周期
    
-   第五项:代码可维护性决定项目寿命
    

更多内容请参阅 [Obsidian](https://obsidian.md/)。

### 7.5 小节 5 - 实现细节

批注的状态管理采用了三态模型:开放(Open)、已解决(Resolved)、已删除(Deleted) _(关键)_。这种设计既保留了历史记录,又能够让用户在需要时方便地回顾之前的讨论内容。 这里使用了 `ProseMirror` 这样的行内代码。

Model performance was evaluated on a held-out test set using accuracy, F1-score, and area under the ROC curve (AUC) as the primary metrics.

更多内容请参阅 [GitHub Pages](https://pages.github.com/)。

| 字段1 | 字段2 | 字段3 | 字段4 |
| --- | --- | --- | --- |
| 值11 | 值12 | 值13 | 值14 |
| 值21 | 值22 | 值23 | 值24 |
| 值31 | 值32 | 值33 | 值34 |
| 值41 | 值42 | 值43 | 值44 |
| 值51 | 值52 | 值53 | 值54 |
| 值61 | 值62 | 值63 | 值64 |
| 值71 | 值72 | 值73 | 值74 |

### 7.6 小节 6 - 性能评估

批注的状态管理采用了三态模型:开放(Open)、已解决(Resolved)、已删除(Deleted)。这种设计既保留了历史记录,又能够让用户在需要时方便地回顾之前的讨论内容。 这里使用了 `Tiptap` 这样的行内代码。

实验结果表明,在工作记忆任务的 n-back 范式下,前额叶皮层和顶叶网络的协同激活与任务难度呈现出显著的正相关关系 _(重要)_。这一发现与以往的研究结果高度一致,进一步验证了我们方法的有效性。 这里使用了 `annotation` 这样的行内代码。

All experiments were conducted on a workstation equipped with an NVIDIA RTX 4090 GPU and 64GB of system memory. The total training time was approximately 6 hours.

-   \[x\] Set up CI/CD pipeline
    
-   \[x\] Configure monitoring
    
-   \[ \] Write API documentation
    
-   \[ \] Conduct security audit
    
-   \[ \] Optimize database queries
    
-   \[ \] Implement caching layer
    

在某些情况下,我们可以使用如下数学公式来描述这一现象: $\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}$

> The important thing is not to stop questioning. Curiosity has its own reason for existing. — Albert Einstein

下面是 `python` 的示例代码:

```python
def fibonacci(n):
    """Generate the Fibonacci sequence up to n terms."""
    a, b = 0, 1
    sequence = []
    while a < n:
        sequence.append(a)
        a, b = b, a + b
    return sequence

if __name__ == "__main__":
    print(fibonacci(100))
```

## 第8章:章节 8 {#chapter-8}

### 8.1 小节 1 - 用户研究

本研究采用功能性磁共振成像(fMRI)技术,结合深度学习模型,对受试者在完成工作记忆任务时的脑区激活模式进行了系统性的分析。实验设计遵循双盲随机对照原则,确保了研究结果的内部效度。

然而,我们也观察到了一些与经典理论不完全吻合的现象。特别是在高负荷条件下,默认模式网络(DMN)的负激活程度出现了明显的下降,这一现象可能反映了注意力资源在不同认知任务之间的动态分配机制。

Training was performed using the Adam optimizer with an initial learning rate of 1e-3 and a cosine annealing schedule over 100 epochs.

### 8.2 小节 2 - 实验方法

本研究的一个潜在局限性在于样本规模相对有限,这在一定程度上限制了研究结果的统计效力和外部效度。未来的研究可以通过多中心合作的方式扩大样本量,以进一步验证我们发现的稳健性。

在过去的十年中,认知神经科学的研究范式经历了从行为学到计算建模、再到大规模神经影像数据分析的深刻转变。这一转变的核心驱动力来自于多模态脑成像技术的飞速发展,以及开源数据分析工具的广泛普及。 这里使用了 `WYSIWYG` 这样的行内代码。

Model performance was evaluated on a held-out test set using accuracy, F1-score, and area under the ROC curve (AUC) as the primary metrics. 这里使用了 `ProseMirror` 这样的行内代码。

-   \[x\] Set up CI/CD pipeline
    
-   \[x\] Configure monitoring
    
-   \[ \] Write API documentation
    
-   \[ \] Conduct security audit
    
-   \[ \] Optimize database queries
    
-   \[ \] Implement caching layer
    

| 字段1 | 字段2 | 字段3 |
| --- | --- | --- |
| 值11 | 值12 | 值13 |
| 值21 | 值22 | 值23 |
| 值31 | 值32 | 值33 |
| 值41 | 值42 | 值43 |
| 值51 | 值52 | 值53 |
| 值61 | 值62 | 值63 |
| 值71 | 值72 | 值73 |
| 值81 | 值82 | 值83 |

### 8.3 小节 3 - 用户研究

嵌套回复是本系统的另一大特色功能,它允许审阅者之间就同一选区展开多轮讨论 _(重要)_。这种对话式的批注模式特别适合学术论文的同行评审场景,能够显著提升协作效率。

本研究的一个潜在局限性在于样本规模相对有限,这在一定程度上限制了研究结果的统计效力和外部效度。未来的研究可以通过多中心合作的方式扩大样本量,以进一步验证我们发现的稳健性。 这里使用了 `WYSIWYG` 这样的行内代码。

> 科学是没有国界的,因为它属于全人类的财富,是照亮世界的火炬。 — 巴斯德

更多内容请参阅 [ProseMirror 参考](https://prosemirror.net/)。

### 8.4 小节 4 - 实验方法

The dataset comprises 128 healthy adults recruited from the local community. All participants provided informed consent in accordance with the Declaration of Helsinki and the institutional review board. 这里使用了 `KaTeX` 这样的行内代码。

本研究采用功能性磁共振成像(fMRI)技术,结合深度学习模型,对受试者在完成工作记忆任务时的脑区激活模式进行了系统性的分析。实验设计遵循双盲随机对照原则,确保了研究结果的内部效度。

1.  需求分析阶段
    
2.  原型设计阶段
    
3.  开发实现阶段
    
4.  测试验证阶段
    
5.  部署上线阶段
    
6.  运维监控阶段
    
7.  迭代优化阶段
    

## 第9章:章节 9 {#chapter-9}

### 9.1 小节 1 - 理论框架

本研究采用功能性磁共振成像(fMRI)技术,结合深度学习模型,对受试者在完成工作记忆任务时的脑区激活模式进行了系统性的分析 _(重要)_。实验设计遵循双盲随机对照原则,确保了研究结果的内部效度。 这里使用了 `WYSIWYG` 这样的行内代码。

We employed a sliding window approach with a window length of 30 TRs and a step size of 1 TR to capture the dynamic nature of functional connectivity patterns. 这里使用了 `Tiptap` 这样的行内代码。

-   第一项:用户界面设计应当遵循一致性原则
    
-   第二项:响应式布局需要考虑多终端适配
    
-   第三项:无障碍访问是基本要求
    
-   第四项:性能优化贯穿整个开发周期
    
-   第五项:代码可维护性决定项目寿命
    

下面是 `bash` 的示例代码:

```bash
#!/bin/bash
# Backup script for Mentor project
SRC="/mnt/e/hermes_playground/Mentor"
DST="/mnt/e/backups/Mentor-$(date +%Y%m%d)"
mkdir -p "$DST"
rsync -avz --exclude="node_modules" "$SRC/" "$DST/"
echo "Backup complete: $DST"
```

| 字段1 | 字段2 | 字段3 | 字段4 |
| --- | --- | --- | --- |
| 值11 | 值12 | 值13 | 值14 |
| 值21 | 值22 | 值23 | 值24 |
| 值31 | 值32 | 值33 | 值34 |
| 值41 | 值42 | 值43 | 值44 |
| 值51 | 值52 | 值53 | 值54 |
| 值61 | 值62 | 值63 | 值64 |
| 值71 | 值72 | 值73 | 值74 |

### 9.2 小节 2 - 实验方法

在过去的十年中,认知神经科学的研究范式经历了从行为学到计算建模、再到大规模神经影像数据分析的深刻转变 _(TODO)_。这一转变的核心驱动力来自于多模态脑成像技术的飞速发展,以及开源数据分析工具的广泛普及。

在某些情况下,我们可以使用如下数学公式来描述这一现象: $\sum_{i=1}^{n} i = \frac{n(n+1)}{2}$

下面是 `bash` 的示例代码:

```bash
#!/bin/bash
# Backup script for Mentor project
SRC="/mnt/e/hermes_playground/Mentor"
DST="/mnt/e/backups/Mentor-$(date +%Y%m%d)"
mkdir -p "$DST"
rsync -avz --exclude="node_modules" "$SRC/" "$DST/"
echo "Backup complete: $DST"
```

### 9.3 小节 3 - 数据分析

本研究采用功能性磁共振成像(fMRI)技术,结合深度学习模型,对受试者在完成工作记忆任务时的脑区激活模式进行了系统性的分析 _(重要)_。实验设计遵循双盲随机对照原则,确保了研究结果的内部效度。

The dataset comprises 128 healthy adults recruited from the local community. All participants provided informed consent in accordance with the Declaration of Helsinki and the institutional review board.

-   \[x\] Set up CI/CD pipeline
    
-   \[x\] Configure monitoring
    
-   \[ \] Write API documentation
    
-   \[ \] Conduct security audit
    
-   \[ \] Optimize database queries
    
-   \[ \] Implement caching layer
    

> 在科学上没有平坦的大道,只有不畏劳苦沿着陡峭山路攀登的人,才有希望达到光辉的顶点。 — 马克思

更多内容请参阅 [KaTeX 数学公式](https://katex.org/)。

下面是 `json` 的示例代码:

```json
{
  "name": "mentor-stress-test",
  "version": "2.0.0",
  "dependencies": {
    "tiptap": "^2.1.0",
    "katex": "^0.16.0",
    "turndown": "^7.1.0"
  },
  "scripts": {
    "start": "python3 -m http.server 8080",
    "test": "playwright test"
  }
}
```

### 9.4 小节 4 - 实现细节

数据分析过程中,我们严格遵循了多重比较校正的统计学规范。具体而言,我们采用了基于 cluster-level 的 FWE (family-wise error) 校正方法,并以 p < 0.05 作为显著性阈值。

然而,我们也观察到了一些与经典理论不完全吻合的现象 _(重要)_。特别是在高负荷条件下,默认模式网络(DMN)的负激活程度出现了明显的下降,这一现象可能反映了注意力资源在不同认知任务之间的动态分配机制。

Functional connectivity was estimated using the Pearson correlation coefficient between the mean BOLD signals of predefined regions of interest (ROIs) from the AAL atlas.

> Stay hungry, stay foolish. — Steve Jobs

| 字段1 | 字段2 | 字段3 | 字段4 | 字段5 |
| --- | --- | --- | --- | --- |
| 值11 | 值12 | 值13 | 值14 | 值15 |
| 值21 | 值22 | 值23 | 值24 | 值25 |
| 值31 | 值32 | 值33 | 值34 | 值35 |
| 值41 | 值42 | 值43 | 值44 | 值45 |
| 值51 | 值52 | 值53 | 值54 | 值55 |

### 9.5 小节 5 - 实现细节

本研究采用功能性磁共振成像(fMRI)技术,结合深度学习模型,对受试者在完成工作记忆任务时的脑区激活模式进行了系统性的分析 _(TODO)_。实验设计遵循双盲随机对照原则,确保了研究结果的内部效度。

值得注意的是,个体差异在神经影像数据分析中扮演着至关重要的角色。即使是同质性较高的受试者群体,其脑区激活模式仍可能存在显著的个体间变异。这种变异既可能源于遗传因素,也可能反映了个体生活经历和学习经验的累积效应。

The source code and analysis scripts are publicly available on GitHub to facilitate reproducibility and encourage further research in this direction. 这里使用了 `WYSIWYG` 这样的行内代码。

-   \[x\] Set up CI/CD pipeline
    
-   \[x\] Configure monitoring
    
-   \[ \] Write API documentation
    
-   \[ \] Conduct security audit
    
-   \[ \] Optimize database queries
    
-   \[ \] Implement caching layer
    

> 想象力比知识更重要,因为知识是有限的,而想象力概括着世界上的一切。 — 爱因斯坦

更多内容请参阅 [ProseMirror 参考](https://prosemirror.net/)。

### 9.6 小节 6 - 实现细节

本研究采用功能性磁共振成像(fMRI)技术,结合深度学习模型,对受试者在完成工作记忆任务时的脑区激活模式进行了系统性的分析 _(注意)_。实验设计遵循双盲随机对照原则,确保了研究结果的内部效度。

本研究采用功能性磁共振成像(fMRI)技术,结合深度学习模型,对受试者在完成工作记忆任务时的脑区激活模式进行了系统性的分析。实验设计遵循双盲随机对照原则,确保了研究结果的内部效度。

Training was performed using the Adam optimizer with an initial learning rate of 1e-3 and a cosine annealing schedule over 100 epochs.

-   \[x\] Set up CI/CD pipeline
    
-   \[x\] Configure monitoring
    
-   \[ \] Write API documentation
    
-   \[ \] Conduct security audit
    
-   \[ \] Optimize database queries
    
-   \[ \] Implement caching layer
    

在某些情况下,我们可以使用如下数学公式来描述这一现象: $P(A|B) = \frac{P(B|A) \cdot P(A)}{P(B)}$

更多内容请参阅 [Tiptap 官方文档](https://tiptap.dev/docs)。

下面是 `rust` 的示例代码:

```rust
fn main() {
    let numbers: Vec<i32> = (1..=100).collect();
    let sum: i32 = numbers.iter().sum();
    let avg = sum as f64 / numbers.len() as f64;
    println!("Sum: {}, Average: {:.2}", sum, avg);
}
```

| 字段1 | 字段2 | 字段3 |
| --- | --- | --- |
| 值11 | 值12 | 值13 |
| 值21 | 值22 | 值23 |
| 值31 | 值32 | 值33 |
| 值41 | 值42 | 值43 |
| 值51 | 值52 | 值53 |
| 值61 | 值62 | 值63 |
| 值71 | 值72 | 值73 |

### 9.7 小节 7 - 未来工作

嵌套回复是本系统的另一大特色功能,它允许审阅者之间就同一选区展开多轮讨论 _(TODO)_。这种对话式的批注模式特别适合学术论文的同行评审场景,能够显著提升协作效率。 这里使用了 `Tiptap` 这样的行内代码。

> 想象力比知识更重要,因为知识是有限的,而想象力概括着世界上的一切。 — 爱因斯坦

| 字段1 | 字段2 | 字段3 |
| --- | --- | --- |
| 值11 | 值12 | 值13 |
| 值21 | 值22 | 值23 |
| 值31 | 值32 | 值33 |
| 值41 | 值42 | 值43 |
| 值51 | 值52 | 值53 |
| 值61 | 值62 | 值63 |
| 值71 | 值72 | 值73 |

## 第10章:章节 10 {#chapter-10}

### 10.1 小节 1 - 性能评估

在过去的十年中,认知神经科学的研究范式经历了从行为学到计算建模、再到大规模神经影像数据分析的深刻转变。这一转变的核心驱动力来自于多模态脑成像技术的飞速发展,以及开源数据分析工具的广泛普及。

We employed a sliding window approach with a window length of 30 TRs and a step size of 1 TR to capture the dynamic nature of functional connectivity patterns.

1.  需求分析阶段
    
2.  原型设计阶段
    
3.  开发实现阶段
    
4.  测试验证阶段
    
5.  部署上线阶段
    
6.  运维监控阶段
    
7.  迭代优化阶段
    

### 10.2 小节 2 - 性能评估

批注的状态管理采用了三态模型:开放(Open)、已解决(Resolved)、已删除(Deleted)。这种设计既保留了历史记录,又能够让用户在需要时方便地回顾之前的讨论内容。

批注系统的核心设计原则是确保源文档的完整性与可读性。我们采用侧车文件(Sidecar File)的存储模式,将所有批注信息存储在独立的 JSON 文件中,从而避免了将批注元数据污染原始 Markdown 内容的风险。

### 10.3 小节 3 - 相关工作

Functional connectivity was estimated using the Pearson correlation coefficient between the mean BOLD signals of predefined regions of interest (ROIs) from the AAL atlas.

在性能优化方面,我们针对大型文档的渲染做了大量的工作。通过虚拟滚动和按需加载技术,即使面对数百页的长文档,系统依然能够保持流畅的交互体验。

嵌套回复是本系统的另一大特色功能,它允许审阅者之间就同一选区展开多轮讨论 _(TODO)_。这种对话式的批注模式特别适合学术论文的同行评审场景,能够显著提升协作效率。

在某些情况下,我们可以使用如下数学公式来描述这一现象: $\nabla \cdot \vec{E} = \frac{\rho}{\varepsilon_0}$

> 想象力比知识更重要,因为知识是有限的,而想象力概括着世界上的一切。 — 爱因斯坦

| 字段1 | 字段2 | 字段3 |
| --- | --- | --- |
| 值11 | 值12 | 值13 |
| 值21 | 值22 | 值23 |
| 值31 | 值32 | 值33 |
| 值41 | 值42 | 值43 |
| 值51 | 值52 | 值53 |
| 值61 | 值62 | 值63 |
| 值71 | 值72 | 值73 |
| 值81 | 值82 | 值83 |

### 10.4 小节 4 - 未来工作

Model performance was evaluated on a held-out test set using accuracy, F1-score, and area under the ROC curve (AUC) as the primary metrics. 这里使用了 `annotation` 这样的行内代码。

1.  需求分析阶段
    
2.  原型设计阶段
    
3.  开发实现阶段
    
4.  测试验证阶段
    
5.  部署上线阶段
    
6.  运维监控阶段
    
7.  迭代优化阶段
    

下面是 `python` 的示例代码:

```python
def fibonacci(n):
    """Generate the Fibonacci sequence up to n terms."""
    a, b = 0, 1
    sequence = []
    while a < n:
        sequence.append(a)
        a, b = b, a + b
    return sequence

if __name__ == "__main__":
    print(fibonacci(100))
```

| 字段1 | 字段2 | 字段3 | 字段4 |
| --- | --- | --- | --- |
| 值11 | 值12 | 值13 | 值14 |
| 值21 | 值22 | 值23 | 值24 |
| 值31 | 值32 | 值33 | 值34 |
| 值41 | 值42 | 值43 | 值44 |

### 10.5 小节 5 - 数据分析

批注系统的核心设计原则是确保源文档的完整性与可读性。我们采用侧车文件(Sidecar File)的存储模式,将所有批注信息存储在独立的 JSON 文件中,从而避免了将批注元数据污染原始 Markdown 内容的风险。

批注的状态管理采用了三态模型:开放(Open)、已解决(Resolved)、已删除(Deleted)。这种设计既保留了历史记录,又能够让用户在需要时方便地回顾之前的讨论内容。

> 在科学上没有平坦的大道,只有不畏劳苦沿着陡峭山路攀登的人,才有希望达到光辉的顶点。 — 马克思

更多内容请参阅 [MDN Web Docs](https://developer.mozilla.org/)。

## 第11章:章节 11 {#chapter-11}

### 11.1 小节 1 - 性能评估

Limitations of the current study include the relatively modest sample size and the cross-sectional nature of the data, which precludes causal inference. 这里使用了 `annotation` 这样的行内代码。

数据分析过程中,我们严格遵循了多重比较校正的统计学规范。具体而言,我们采用了基于 cluster-level 的 FWE (family-wise error) 校正方法,并以 p < 0.05 作为显著性阈值。 这里使用了 `annotation` 这样的行内代码。

1.  需求分析阶段
    
2.  原型设计阶段
    
3.  开发实现阶段
    
4.  测试验证阶段
    
5.  部署上线阶段
    
6.  运维监控阶段
    
7.  迭代优化阶段
    

在某些情况下,我们可以使用如下数学公式来描述这一现象: $E = mc^2$

下面是 `rust` 的示例代码:

```rust
fn main() {
    let numbers: Vec<i32> = (1..=100).collect();
    let sum: i32 = numbers.iter().sum();
    let avg = sum as f64 / numbers.len() as f64;
    println!("Sum: {}, Average: {:.2}", sum, avg);
}
```

### 11.2 小节 2 - 结果讨论

本研究采用功能性磁共振成像(fMRI)技术,结合深度学习模型,对受试者在完成工作记忆任务时的脑区激活模式进行了系统性的分析 _(关键)_。实验设计遵循双盲随机对照原则,确保了研究结果的内部效度。 这里使用了 `ProseMirror` 这样的行内代码。

All experiments were conducted on a workstation equipped with an NVIDIA RTX 4090 GPU and 64GB of system memory. The total training time was approximately 6 hours.

在某些情况下,我们可以使用如下数学公式来描述这一现象: $\nabla \cdot \vec{E} = \frac{\rho}{\varepsilon_0}$

> 科学是没有国界的,因为它属于全人类的财富,是照亮世界的火炬。 — 巴斯德

### 11.3 小节 3 - 用户研究

然而,我们也观察到了一些与经典理论不完全吻合的现象。特别是在高负荷条件下,默认模式网络(DMN)的负激活程度出现了明显的下降,这一现象可能反映了注意力资源在不同认知任务之间的动态分配机制。

总体而言,本研究为理解工作记忆的神经机制提供了新的证据,并展示了深度学习技术在神经影像数据分析中的巨大潜力 _(关键)_。我们相信,随着算法和算力的持续进步,这一领域将迎来更加激动人心的发展。

1.  需求分析阶段
    
2.  原型设计阶段
    
3.  开发实现阶段
    
4.  测试验证阶段
    
5.  部署上线阶段
    
6.  运维监控阶段
    
7.  迭代优化阶段
    

在某些情况下,我们可以使用如下数学公式来描述这一现象: $\hat{H}\Psi = E\Psi$

> Stay hungry, stay foolish. — Steve Jobs

下面是 `json` 的示例代码:

```json
{
  "name": "mentor-stress-test",
  "version": "2.0.0",
  "dependencies": {
    "tiptap": "^2.1.0",
    "katex": "^0.16.0",
    "turndown": "^7.1.0"
  },
  "scripts": {
    "start": "python3 -m http.server 8080",
    "test": "playwright test"
  }
}
```

### 11.4 小节 4 - 局限性

Our analysis pipeline consists of several stages: preprocessing, feature extraction, model training, and interpretation. Each stage is carefully designed to maximize reproducibility and scientific rigor. 这里使用了 `ProseMirror` 这样的行内代码。

总体而言,本研究为理解工作记忆的神经机制提供了新的证据,并展示了深度学习技术在神经影像数据分析中的巨大潜力。我们相信,随着算法和算力的持续进步,这一领域将迎来更加激动人心的发展。

在某些情况下,我们可以使用如下数学公式来描述这一现象: $P(A|B) = \frac{P(B|A) \cdot P(A)}{P(B)}$

## 第12章:章节 12 {#chapter-12}

### 12.1 小节 1 - 未来工作

嵌套回复是本系统的另一大特色功能,它允许审阅者之间就同一选区展开多轮讨论。这种对话式的批注模式特别适合学术论文的同行评审场景,能够显著提升协作效率。

All experiments were conducted on a workstation equipped with an NVIDIA RTX 4090 GPU and 64GB of system memory. The total training time was approximately 6 hours.

1.  需求分析阶段
    
2.  原型设计阶段
    
3.  开发实现阶段
    
4.  测试验证阶段
    
5.  部署上线阶段
    
6.  运维监控阶段
    
7.  迭代优化阶段
    

> The only way to do great work is to love what you do. — Steve Jobs

### 12.2 小节 2 - 局限性

在可解释性方面,我们引入了基于梯度加权的类激活映射(Grad-CAM)技术,对深度学习模型的决策过程进行了可视化分析。这一方法能够有效地揭示模型在进行预测时所关注的关键脑区,从而为神经科学解释提供了直观的依据。 这里使用了 `Tiptap` 这样的行内代码。

数据分析过程中,我们严格遵循了多重比较校正的统计学规范 _(注意)_。具体而言,我们采用了基于 cluster-level 的 FWE (family-wise error) 校正方法,并以 p < 0.05 作为显著性阈值。

Future work will explore the application of transformer-based architectures to capture long-range dependencies in brain network dynamics. 这里使用了 `WYSIWYG` 这样的行内代码。

-   第一项:用户界面设计应当遵循一致性原则
    
-   第二项:响应式布局需要考虑多终端适配
    
-   第三项:无障碍访问是基本要求
    
-   第四项:性能优化贯穿整个开发周期
    
-   第五项:代码可维护性决定项目寿命
    

下面是 `yaml` 的示例代码:

```yaml
name: Mentor Stress Test
version: 1.0.0
description: Long markdown for e2e pressure testing
authors:
  - Hermes Agent
  - User
config:
  viewport: 1440x900
  timeout: 30000
  retries: 3
environments:
  - dev
  - staging
  - production
```

### 12.3 小节 3 - 用户研究

实验结果表明,在工作记忆任务的 n-back 范式下,前额叶皮层和顶叶网络的协同激活与任务难度呈现出显著的正相关关系 _(TODO)_。这一发现与以往的研究结果高度一致,进一步验证了我们方法的有效性。 这里使用了 `WYSIWYG` 这样的行内代码。

在某些情况下,我们可以使用如下数学公式来描述这一现象: $\mathcal{L} = -\frac{1}{N}\sum_{i=1}^{N} y_i \log(\hat{y}_i)$

> The only way to do great work is to love what you do. — Steve Jobs

| 字段1 | 字段2 | 字段3 | 字段4 |
| --- | --- | --- | --- |
| 值11 | 值12 | 值13 | 值14 |
| 值21 | 值22 | 值23 | 值24 |
| 值31 | 值32 | 值33 | 值34 |
| 值41 | 值42 | 值43 | 值44 |
| 值51 | 值52 | 值53 | 值54 |
| 值61 | 值62 | 值63 | 值64 |

### 12.4 小节 4 - 未来工作

批注系统的核心设计原则是确保源文档的完整性与可读性。我们采用侧车文件(Sidecar File)的存储模式,将所有批注信息存储在独立的 JSON 文件中,从而避免了将批注元数据污染原始 Markdown 内容的风险。

We hope this work will inspire further investigations into the intersection of artificial intelligence and cognitive neuroscience. 这里使用了 `KaTeX` 这样的行内代码。

值得注意的是,个体差异在神经影像数据分析中扮演着至关重要的角色。即使是同质性较高的受试者群体,其脑区激活模式仍可能存在显著的个体间变异。这种变异既可能源于遗传因素,也可能反映了个体生活经历和学习经验的累积效应。

1.  需求分析阶段
    
2.  原型设计阶段
    
3.  开发实现阶段
    
4.  测试验证阶段
    
5.  部署上线阶段
    
6.  运维监控阶段
    
7.  迭代优化阶段
    

在某些情况下,我们可以使用如下数学公式来描述这一现象: $\sum_{i=1}^{n} i = \frac{n(n+1)}{2}$

更多内容请参阅 [KaTeX 数学公式](https://katex.org/)。

## 附录 A: 代码示例合集

### A.1 PYTHON 示例

```python
def fibonacci(n):
    """Generate the Fibonacci sequence up to n terms."""
    a, b = 0, 1
    sequence = []
    while a < n:
        sequence.append(a)
        a, b = b, a + b
    return sequence

if __name__ == "__main__":
    print(fibonacci(100))
```

### A.2 JAVASCRIPT 示例

```javascript
function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

const log = debounce(console.log, 300);
log("hello");
log("world");
```

### A.3 BASH 示例

```bash
#!/bin/bash
# Backup script for Mentor project
SRC="/mnt/e/hermes_playground/Mentor"
DST="/mnt/e/backups/Mentor-$(date +%Y%m%d)"
mkdir -p "$DST"
rsync -avz --exclude="node_modules" "$SRC/" "$DST/"
echo "Backup complete: $DST"
```

### A.4 SQL 示例

```sql
SELECT user_id, COUNT(*) AS annotation_count
FROM annotations
WHERE created_at >= '2026-01-01'
GROUP BY user_id
HAVING COUNT(*) > 10
ORDER BY annotation_count DESC
LIMIT 50;
```

### A.5 YAML 示例

```yaml
name: Mentor Stress Test
version: 1.0.0
description: Long markdown for e2e pressure testing
authors:
  - Hermes Agent
  - User
config:
  viewport: 1440x900
  timeout: 30000
  retries: 3
environments:
  - dev
  - staging
  - production
```

### A.6 RUST 示例

```rust
fn main() {
    let numbers: Vec<i32> = (1..=100).collect();
    let sum: i32 = numbers.iter().sum();
    let avg = sum as f64 / numbers.len() as f64;
    println!("Sum: {}, Average: {:.2}", sum, avg);
}
```

### A.7 JSON 示例

```json
{
  "name": "mentor-stress-test",
  "version": "2.0.0",
  "dependencies": {
    "tiptap": "^2.1.0",
    "katex": "^0.16.0",
    "turndown": "^7.1.0"
  },
  "scripts": {
    "start": "python3 -m http.server 8080",
    "test": "playwright test"
  }
}
```

## 附录 B: 数学公式汇总

1.  公式: $E = mc^2$
    
2.  公式: $\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}$
    
3.  公式: $\sum_{i=1}^{n} i = \frac{n(n+1)}{2}$
    
4.  公式: $\nabla \cdot \vec{E} = \frac{\rho}{\varepsilon_0}$
    
5.  公式: $\hat{H}\Psi = E\Psi$
    
6.  公式: $P(A|B) = \frac{P(B|A) \cdot P(A)}{P(B)}$
    
7.  公式: $\mathcal{L} = -\frac{1}{N}\sum_{i=1}^{N} y_i \log(\hat{y}_i)$
    
8.  公式: $f(x) = \frac{1}{\sqrt{2\pi\sigma^2}} e^{-\frac{(x-\mu)^2}{2\sigma^2}}$
    

## 附录 C: 数据汇总表

| 编号 | 名称 | 类别 | 数量 | 占比 | 备注 |
| --- | --- | --- | --- | --- | --- |
| 1 | 项目-001 | 类型 C | 7579 | 52.38% | 进行中 |
| 2 | 项目-002 | 类型 B | 5275 | 15.99% |   |
| 3 | 项目-003 | 类型 C | 518 | 88.58% | 进行中 |
| 4 | 项目-004 | 类型 D | 6336 | 7.79% | 已归档 |
| 5 | 项目-005 | 类型 A | 174 | 36.73% |   |
| 6 | 项目-006 | 类型 A | 4539 | 55.24% | 进行中 |
| 7 | 项目-007 | 类型 C | 4206 | 9.36% | 暂停 |
| 8 | 项目-008 | 类型 A | 8914 | 7.40% | 进行中 |
| 9 | 项目-009 | 类型 D | 9156 | 34.80% | 进行中 |
| 10 | 项目-010 | 类型 B | 2462 | 19.48% | 待评审 |
| 11 | 项目-011 | 类型 A | 6405 | 25.19% |   |
| 12 | 项目-012 | 类型 D | 5959 | 19.17% | 进行中 |
| 13 | 项目-013 | 类型 C | 7771 | 6.55% |   |
| 14 | 项目-014 | 类型 B | 4711 | 79.77% | 暂停 |
| 15 | 项目-015 | 类型 A | 9109 | 34.55% | 进行中 |
| 16 | 项目-016 | 类型 C | 7771 | 63.49% | 已完成 |
| 17 | 项目-017 | 类型 C | 2497 | 26.87% | 已归档 |
| 18 | 项目-018 | 类型 A | 3415 | 30.73% | 待评审 |
| 19 | 项目-019 | 类型 D | 1187 | 47.88% | 待评审 |
| 20 | 项目-020 | 类型 C | 2155 | 97.05% |   |
| 21 | 项目-021 | 类型 A | 1123 | 29.15% | 已归档 |
| 22 | 项目-022 | 类型 A | 3311 | 65.39% | 暂停 |
| 23 | 项目-023 | 类型 A | 502 | 98.35% | 进行中 |
| 24 | 项目-024 | 类型 A | 5226 | 9.46% | 已归档 |
| 25 | 项目-025 | 类型 D | 5487 | 54.05% | 暂停 |
| 26 | 项目-026 | 类型 B | 710 | 35.82% |   |
| 27 | 项目-027 | 类型 D | 8015 | 68.96% | 已完成 |
| 28 | 项目-028 | 类型 C | 5958 | 20.24% | 待评审 |
| 29 | 项目-029 | 类型 C | 6605 | 53.72% | 已完成 |
| 30 | 项目-030 | 类型 A | 7110 | 46.58% |   |

## 附录 D: 多级嵌套列表

-   一级项 1
    
    -   二级项 1.1
        
        -   三级项 1.1.1
            
            -   四级项 1.1.1.1
                
            -   四级项 1.1.1.2
                
        -   三级项 1.1.2
            
    -   二级项 1.2
        
-   一级项 2
    
    -   二级项 2.1
        
        -   三级项 2.1.1
            
        -   三级项 2.1.2
            
    -   二级项 2.2
        
        1.  有序 2.2.1
            
        2.  有序 2.2.2
            
        3.  有序 2.2.3
            
-   一级项 3
    

## 附录 E: HTML 内联元素

这是一个使用 <kbd>Ctrl</kbd>+<kbd>S</kbd> 保存文档的快捷键提示。

<details><summary>点击展开</summary>

这是折叠块内部的内容,用于测试 `<details>` / `<summary>` 标签的渲染。

-   可以包含列表
    
-   可以包含 `行内代码`
    
-   可以包含 **加粗** 和 _斜体_ 文本
    

</details>

<sub>下标</sub>,<sup>上标</sup>,<mark>高亮</mark>,<ins>下划线</ins>。

## 附录 F: 特殊字符与转义

-   反引号: \`
    
-   星号: \*
    
-   下划线: \_
    
-   大括号: { }
    
-   方括号: \[ \]
    
-   井号: #
    
-   加号: +
    
-   减号: -
    
-   感叹号: !
    
-   竖线: |
    

Unicode 字符: ← → ↑ ↓ ⇒ ⇔ ∀ ∃ ∈ ∉ ⊂ ⊃ ∪ ∩ ∅ ∞ ∂ ∇ ∫ ∑ ∏ √ ± ≈ ≠ ≤ ≥ α β γ δ ε ζ η θ λ μ π ρ σ τ φ χ ψ ω

Emoji: 🚀 🎉 🔥 ⭐ 💡 📝 ✅ ❌ ⚠️ 📊 🧠 🎯 💻 🌟 ✨ 🎨

## 结尾

以上就是这份超长测试文档的全部内容。文档涵盖了:

-   12 个主章节 + 附录 A-F
    
-   各种 Markdown 元素 (标题、段落、列表、表格、公式、代码块、引用、链接、图片)
    
-   HTML 内联元素 (kbd, details, sub, sup, mark, ins)
    
-   特殊字符和 Unicode
    
-   中英文混合内容
    

这份文档可用于:

1.  e2e 测试中压力渲染性能评估
    
2.  大纲生成测试
    
3.  批量批注锚点定位测试
    
4.  滚动性能测试
    
5.  导出 (HTML/DOCX/PDF) 测试
    

**生成完成时间:** 2026-06-24

* * *