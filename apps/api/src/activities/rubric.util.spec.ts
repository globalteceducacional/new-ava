import { calculateRubricGrade } from './rubric.util';

describe('calculateRubricGrade', () => {
  it('aplica pesos 40/40/20 corretamente', () => {
    const grade = calculateRubricGrade(
      [
        { key: 'clareza', label: 'Clareza', weight: 40 },
        { key: 'funcionamento', label: 'Funcionamento', weight: 40 },
        { key: 'comentarios', label: 'Comentários', weight: 20 },
      ],
      { clareza: 8, funcionamento: 10, comentarios: 5 },
    );
    // 8*0.4 + 10*0.4 + 5*0.2 = 3.2 + 4 + 1 = 8.2
    expect(grade).toBe(8.2);
  });
});
