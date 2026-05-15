/**
 * CasbinRule entity — flags domain (Pillar 5: Permissions stub).
 */

import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity("casbin_rule")
export class CasbinRule {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  /** Policy type: "p" for permission, "g" for grouping (RBAC). */
  @Column()
  ptype!: string;

  @Column({ nullable: true })
  v0?: string;

  @Column({ nullable: true })
  v1?: string;

  @Column({ nullable: true })
  v2?: string;

  @Column({ nullable: true })
  v3?: string;

  @Column({ nullable: true })
  v4?: string;

  @Column({ nullable: true })
  v5?: string;
}
