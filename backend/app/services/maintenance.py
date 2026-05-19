from datetime import datetime, timedelta, timezone

from app.schemas.maintenance import MaintenanceRequest, MaintenanceResponse, MaintenanceTask

_TASKS_TEMPLATES = [
    ("roller_check", "Проверка и техобслуживание катка: гидравлика, вибратор, уплотнители"),
    ("paver_check", "Техобслуживание укладчика: шнек, рама, нагреватель плиты"),
    ("antifreeze_order", "Заказ антифриза/промывки для системы охлаждения"),
    ("shelter_install", "Установка тента для защиты свежеуложенного покрытия"),
]


def schedule_maintenance(req: MaintenanceRequest) -> MaintenanceResponse:
    now = datetime.now(tz=timezone.utc)
    tasks: list[MaintenanceTask] = []

    for site_id in req.site_ids:
        for i, (task_type, description) in enumerate(_TASKS_TEMPLATES):
            tasks.append(
                MaintenanceTask(
                    site_id=site_id,
                    task_type=task_type,
                    description=description,
                    scheduled_at=now + timedelta(hours=i),
                    priority="высокий" if i == 0 else "средний",
                )
            )

    return MaintenanceResponse(tasks=tasks, total=len(tasks))
