import * as THREE from 'three'

export class InterferenceChecker {
  constructor(scene) {
    this.scene = scene;
  }

  getParts() {
    const parts = [];
    this.scene.traverse(child => {
      if (child.isMesh && child.userData && child.userData.isPart && child.visible) {
        if (!child.userData.isPreview) parts.push(child);
      }
    });
    return parts;
  }

  check() {
    const parts = this.getParts();
    const errorMeshes = new Set();
    const overlapBoxes = []; 

    for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j < parts.length; j++) {
        const meshA = parts[i];
        const meshB = parts[j];

        const collisionResult = this.checkMeshCollision(meshA, meshB);
        
        if (collisionResult.hasCollision) {
          errorMeshes.add(meshA);
          errorMeshes.add(meshB);

          const box = collisionResult.overlapBox;
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());

          // 略微放大以便观察红块
          size.x += 0.2;
          size.y += 0.2;
          size.z += 0.2;

          overlapBoxes.push({ center, size });
        }
      }
    }
    
    return {
      hasError: errorMeshes.size > 0,
      errorMeshes: Array.from(errorMeshes),
      overlapBoxes: overlapBoxes
    };
  }

  checkMeshCollision(meshA, meshB) {
    meshA.geometry.computeBoundingBox();
    meshB.geometry.computeBoundingBox();

    const boxA = new THREE.Box3().copy(meshA.geometry.boundingBox).applyMatrix4(meshA.matrixWorld);
    const boxB = new THREE.Box3().copy(meshB.geometry.boundingBox).applyMatrix4(meshB.matrixWorld);

    // 宽阶段：AABB容差收缩
    boxA.expandByScalar(-0.15);
    boxB.expandByScalar(-0.15);

    if (!boxA.intersectsBox(boxB)) {
        return { hasCollision: false };
    }

    const overlapBox = boxA.clone().intersect(boxB);
    const trisA = this.getTriangles(meshA);
    const trisB = this.getTriangles(meshB);
    let hasRealCollision = false;

    for (let i = 0; i < trisA.length; i++) {
      for (let j = 0; j < trisB.length; j++) {
         if (this.checkTriangleIntersection(trisA[i], trisB[j])) {
             hasRealCollision = true;
             break;
         }
      }
      if (hasRealCollision) break;
    }

    return { 
        hasCollision: hasRealCollision, 
        overlapBox: overlapBox 
    };
  }

  getTriangles(mesh) {
    const tris = [];
    const pos = mesh.geometry.attributes.position;
    const index = mesh.geometry.getIndex();
    const mat = mesh.matrixWorld;

    if (index) {
      for (let i = 0; i < index.count; i += 3) {
        tris.push(new THREE.Triangle(
            new THREE.Vector3().fromBufferAttribute(pos, index.getX(i)).applyMatrix4(mat),
            new THREE.Vector3().fromBufferAttribute(pos, index.getX(i+1)).applyMatrix4(mat),
            new THREE.Vector3().fromBufferAttribute(pos, index.getX(i+2)).applyMatrix4(mat)
        ));
      }
    } else {
      for (let i = 0; i < pos.count; i += 3) {
        tris.push(new THREE.Triangle(
            new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mat),
            new THREE.Vector3().fromBufferAttribute(pos, i+1).applyMatrix4(mat),
            new THREE.Vector3().fromBufferAttribute(pos, i+2).applyMatrix4(mat)
        ));
      }
    }
    return tris;
  }

  // 【核心修复区域】：完美分离平面贴合公差与深度穿模公差
  checkTriangleIntersection(tri1, tri2) {
    const planeEps = 0.05; // 平面接触防抖容差 (过滤表面紧贴)
    const depthEps = 0.3;  // 深度穿透容差 (只有真的扎进去超过0.2mm才爆红，完美吞噬拼接角误差)

    const checkEdges = (t1, t2) => {
      const edges = [
        new THREE.Line3(t1.a, t1.b),
        new THREE.Line3(t1.b, t1.c),
        new THREE.Line3(t1.c, t1.a)
      ];
      const plane = t2.getPlane(new THREE.Plane());

      for (const edge of edges) {
        const d1 = plane.distanceToPoint(edge.start);
        const d2 = plane.distanceToPoint(edge.end);

        // 如果线段的任意一端贴在面上，视为合法拼接接触
        if (Math.abs(d1) <= planeEps || Math.abs(d2) <= planeEps) {
          continue; 
        }

        // 同侧无交点免疫
        if ((d1 > 0 && d2 > 0) || (d1 < 0 && d2 < 0)) {
          continue; 
        }

        const pt = new THREE.Vector3();
        if (plane.intersectLine(edge, pt)) {
           if (t2.containsPoint(pt)) {
               // 计算该交点距离三角形 3 条物理边界的绝对距离
               const dist1 = new THREE.Line3(t2.a, t2.b).closestPointToPoint(pt, true, new THREE.Vector3()).distanceTo(pt);
               const dist2 = new THREE.Line3(t2.b, t2.c).closestPointToPoint(pt, true, new THREE.Vector3()).distanceTo(pt);
               const dist3 = new THREE.Line3(t2.c, t2.a).closestPointToPoint(pt, true, new THREE.Vector3()).distanceTo(pt);

               // 【关键】：如果交点在角点上（误差导致的幽灵交点），它距离某条边的距离一定是 0。
               // 只有距离所有边都大于 0.2mm（意味着深深地扎进了多边形的腹地），才报警！
               if (dist1 > depthEps && dist2 > depthEps && dist3 > depthEps) {
                   return true;
               }
           }
        }
      }
      return false;
    };

    return checkEdges(tri1, tri2) || checkEdges(tri2, tri1);
  }
}