import * as THREE from 'three'

export class HistoryManager {
  constructor() {
    this.undoStack = [];
    this.redoStack = [];
    this.onAction = null; // 用于触发全局取消选中，防止出现幽灵高亮框
  }

  execute(command) {
    command.execute();
    this.undoStack.push(command);
    this.redoStack = []; // 只要有了新操作，清空重做栈
    if (this.undoStack.length > 50) this.undoStack.shift(); // 最多存 50 步
    if (this.onAction) this.onAction();
  }

  undo() {
    if (this.undoStack.length === 0) return null;
    const cmd = this.undoStack.pop();
    cmd.undo();
    this.redoStack.push(cmd);
    if (this.onAction) this.onAction();
    return cmd.name;
  }

  redo() {
    if (this.redoStack.length === 0) return null;
    const cmd = this.redoStack.pop();
    cmd.execute();
    this.undoStack.push(cmd);
    if (this.onAction) this.onAction();
    return cmd.name;
  }
}

// ================= 各类具体操作指令 =================

export class AddObjectCommand {
  constructor(object, parent, name = '添加特征') {
    this.object = object;
    this.parent = parent;
    this.name = name;
  }
  execute() { this.parent.add(this.object); }
  undo() { this.parent.remove(this.object); }
}

export class DeleteObjectCommand {
  constructor(object, parent) {
    this.object = object;
    this.parent = parent;
    this.name = '删除特征';
  }
  execute() { this.parent.remove(this.object); }
  undo() { this.parent.add(this.object); }
}

// 复合命令（用于镜像等多物体生成）
export class CompoundCommand {
  constructor(name, commands) {
    this.name = name;
    this.commands = commands;
  }
  execute() { this.commands.forEach(cmd => cmd.execute()); }
  // 撤销时反向撤销，保证结构安全
  undo() { [...this.commands].reverse().forEach(cmd => cmd.undo()); }
}

// 移动命令（用于选择工具的拖拽）
export class TransformCommand {
  constructor(items) {
    this.items = items; // {mesh, oldPos, newPos}
    this.name = '移动特征';
  }
  execute() {
    this.items.forEach(item => { item.mesh.position.copy(item.newPos); item.mesh.updateMatrixWorld(); });
  }
  undo() {
    this.items.forEach(item => { item.mesh.position.copy(item.oldPos); item.mesh.updateMatrixWorld(); });
  }
}

// 超级复合命令：折弯生成（包含打组、实体生成、母板几何体修改）
export class AddBendCommand {
  constructor(scene, newBend, parentMesh) {
    this.scene = scene;
    this.newBend = newBend;
    this.parentMesh = parentMesh;
    this.originalParent = parentMesh ? parentMesh.parent : null;
    this.createdGroup = null;
    this.name = '生成折弯';

    // 提前保存母板几何体被切 45度角 之前的数据
    if (this.parentMesh && this.parentMesh.userData.originalPos) {
        this.oldPosArray = new Float32Array(this.parentMesh.userData.originalPos);
        this.newPosArray = new Float32Array(this.parentMesh.geometry.attributes.position.array);
    }
  }
  
  execute() {
    if (this.parentMesh && this.originalParent && this.originalParent.userData.isSheetMetalGroup) {
       this.originalParent.add(this.newBend);
    } else if (this.parentMesh) {
       this.createdGroup = new THREE.Group();
       this.createdGroup.userData.isSheetMetalGroup = true;
       this.scene.add(this.createdGroup);
       this.createdGroup.add(this.parentMesh);
       this.createdGroup.add(this.newBend);
    } else {
       this.scene.add(this.newBend);
    }
    
    // 应用 45 度切角
    if (this.parentMesh && this.newPosArray) {
       this.parentMesh.geometry.attributes.position.array.set(this.newPosArray);
       this.parentMesh.geometry.attributes.position.needsUpdate = true;
       this.parentMesh.geometry.computeVertexNormals();
    }
  }
  
  undo() {
    if (this.createdGroup) {
       this.originalParent.add(this.parentMesh); // 把母板还给原来的空间
       this.scene.remove(this.createdGroup);
    } else if (this.originalParent && this.originalParent.userData.isSheetMetalGroup) {
       this.originalParent.remove(this.newBend);
    } else {
       this.scene.remove(this.newBend);
    }
    
    // 恢复 45 度切角前的数据！完美复原！
    if (this.parentMesh && this.oldPosArray) {
       this.parentMesh.geometry.attributes.position.array.set(this.oldPosArray);
       this.parentMesh.geometry.attributes.position.needsUpdate = true;
       this.parentMesh.geometry.computeVertexNormals();
    }
  }
}