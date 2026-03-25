import json
import tempfile
import os
import cadquery as cq

def main():
    # 1. 找到刚才 C# 存在临时文件夹里的 JSON 数据
    temp_dir = tempfile.gettempdir()
    json_path = os.path.join(temp_dir, "cad_template_data.json")

    print(f"正在读取配置: {json_path}")
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # 2. 提取参数
    pts = data['Profile']
    thickness = data['Parameters']['Thickness']
    tenon_width = data['Parameters']['TenonWidth']
    tenon_depth = data['Parameters']['TenonDepth']

    # ==========================================
    # 【核心修复 1】：计算中心点，将坐标强制归零
    # 彻底解决 CAD 绝对坐标过大导致模型飞远的问题
    # ==========================================
    min_x = min(p[0] for p in pts)
    max_x = max(p[0] for p in pts)
    min_y = min(p[1] for p in pts)
    max_y = max(p[1] for p in pts)
    cx = (min_x + max_x) / 2.0
    cy = (min_y + max_y) / 2.0

    # 生成居中后的新坐标
    cq_pts = [(p[0] - cx, p[1] - cy) for p in pts]

    print("开始执行 3D 几何构建...")
    
    # 3. 参数化拉伸实体 (此时板子绝对在世界坐标正中心)
    board = cq.Workplane("XY").polyline(cq_pts).close().extrude(thickness)

    # ==========================================
    # 【核心修复 2】：增加 combine=True 强制布尔合并
    # 解决榫头和板子分离的问题
    # ==========================================
    final_model = (
        board.faces("<X")             
        .workplane()                  
        .rect(tenon_width, thickness) 
        .extrude(tenon_depth, combine=True)  # 注意这里的 combine=True
    )

    # 5. 导出 STL 格式，保存到当前项目根目录
    project_root = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(project_root, "output_board.stl")
    
    cq.exporters.export(final_model, output_path)

    # 去掉了会导致 Windows CMD 报错的 emoji 表情
    print(f"[成功] 3D 榫卯模型生成成功！")
    print(f"存放路径: {output_path}")

if __name__ == "__main__":
    main()